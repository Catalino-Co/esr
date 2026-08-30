import type { RecordStateFilter, RepositoryContext } from '@esr/core';
import { requireCompanyId } from '@esr/core';
import type { ESRId, Invoice, InvoiceConduce, InvoiceItem } from '@esr/schemas';
import type pg from 'pg';
import { getPostgresPool } from '../connection';
import { appendStateFilter } from './state-filter';
import { appendPagination } from './pagination';

export type InvoiceListFilters = {
	/** Estado de circulacion; por defecto, solo activas. */
	state?: RecordStateFilter;
	/** `emitida` o `anulada`. */
	status?: string;
	client_id?: ESRId;
	work_order_id?: ESRId;
	/** Numero de factura o nombre de cliente. */
	search?: string;
	limit?: number;
	offset?: number;
};

/**
 * Los importes salen como TEXTO. El driver de PostgreSQL entrega un NUMERIC
 * como float y ahi es donde se pierden los centavos; `summarizePayments` ya
 * acepta string y redondea a dos decimales.
 */
const INVOICE_COLUMNS = `
	inv.id, inv.company_id, inv.invoice_number, inv.work_order_id, inv.client_id,
	inv.date, inv.status,
	inv.subtotal::text AS subtotal, inv.discount::text AS discount, inv.total::text AS total,
	inv.notes, inv.cancelled_at, inv.cancel_reason, inv.is_active,
	inv.created_at, inv.updated_at,
	c.name AS client_name, wo.order_number
`;

const INVOICE_JOINS = `
	FROM invoices inv
	LEFT JOIN clients c ON c.id = inv.client_id AND c.company_id = inv.company_id
	LEFT JOIN work_orders wo ON wo.id = inv.work_order_id AND wo.company_id = inv.company_id
`;

/** Solo las entregas se facturan: una devolucion no se cobra. */
const DELIVERY_ONLY = "co.conduce_type <> 'devolucion'";

/** Entregas que todavia no cubre ninguna factura viva. */
const NOT_BILLED = `NOT EXISTS (
	SELECT 1 FROM invoice_conduces ic
	WHERE ic.conduce_id = co.id AND ic.is_active = 1
)`;

export class PostgresInvoiceRepository {
	constructor(private readonly pool: pg.Pool = getPostgresPool()) {}

	private db(client?: pg.PoolClient) {
		return client ?? this.pool;
	}

	/**
	 * Siguiente numero libre. Lee el maximo y suma uno, que es una carrera —dos
	 * emisiones simultaneas leen el mismo maximo—, pero el indice unico
	 * `invoices_company_number_unique` la convierte en un error en vez de en dos
	 * facturas con el mismo numero. Quien llama reintenta.
	 */
	async nextInvoiceNumber(ctx: RepositoryContext, client?: pg.PoolClient): Promise<string> {
		const result = await this.db(client).query<{ siguiente: string }>(
			`SELECT COALESCE(MAX(SUBSTRING(invoice_number FROM '\\d+')::INTEGER), 0) + 1 AS siguiente
			 FROM invoices WHERE company_id = $1`,
			[requireCompanyId(ctx)]
		);
		return `FAC-${String(Number(result.rows[0]?.siguiente ?? 1)).padStart(6, '0')}`;
	}

	async list(ctx: RepositoryContext, filters: InvoiceListFilters = {}): Promise<Invoice[]> {
		const params: unknown[] = [requireCompanyId(ctx)];
		const where = ['inv.company_id = $1'];
		appendStateFilter(params, where, filters.state, 'inv.');

		for (const field of ['status', 'client_id', 'work_order_id'] as const) {
			const value = filters[field];
			if (value !== undefined && value !== null && value !== '') {
				params.push(value);
				where.push(`inv.${field} = $${params.length}`);
			}
		}
		if (filters.search) {
			params.push(`%${filters.search}%`);
			where.push(`(inv.invoice_number ILIKE $${params.length} OR c.name ILIKE $${params.length})`);
		}

		// El cobrado se calcula aqui y no en el bucle de la pantalla: una
		// subconsulta por fila es una sola ida a la base, N consultas son N.
		const result = await this.db().query<Invoice>(
			`SELECT ${INVOICE_COLUMNS},
				COALESCE((
					SELECT SUM(p.amount) FROM payments p
					WHERE p.invoice_id = inv.id AND p.status = 'pagado'
				), 0)::text AS paid
			 ${INVOICE_JOINS}
			 WHERE ${where.join(' AND ')}
			 ORDER BY inv.id DESC${appendPagination(params, filters)}`,
			params
		);
		return result.rows;
	}

	async findById(ctx: RepositoryContext, id: ESRId, client?: pg.PoolClient): Promise<Invoice | null> {
		const result = await this.db(client).query<Invoice>(
			`SELECT ${INVOICE_COLUMNS} ${INVOICE_JOINS} WHERE inv.company_id = $1 AND inv.id = $2`,
			[requireCompanyId(ctx), id]
		);
		return result.rows[0] ?? null;
	}

	async listItems(ctx: RepositoryContext, invoiceId: ESRId, client?: pg.PoolClient): Promise<InvoiceItem[]> {
		const result = await this.db(client).query<InvoiceItem>(
			`SELECT ii.id, ii.company_id, ii.invoice_id, ii.item_id, ii.description,
				ii.quantity::text AS quantity, ii.price::text AS price, ii.total::text AS total,
				i.internal_code
			 FROM invoice_items ii
			 LEFT JOIN items i ON i.id = ii.item_id AND i.company_id = ii.company_id
			 WHERE ii.company_id = $1 AND ii.invoice_id = $2
			 ORDER BY ii.id`,
			[requireCompanyId(ctx), invoiceId]
		);
		return result.rows;
	}

	/** Las entregas que cubre la factura, las liberadas por una anulacion incluidas. */
	async listConduces(
		ctx: RepositoryContext,
		invoiceId: ESRId,
		client?: pg.PoolClient
	): Promise<InvoiceConduce[]> {
		const result = await this.db(client).query<InvoiceConduce>(
			`SELECT ic.id, ic.invoice_id, ic.conduce_id, ic.is_active,
				co.note_number, co.date
			 FROM invoice_conduces ic
			 JOIN conduces co ON co.id = ic.conduce_id AND co.company_id = ic.company_id
			 WHERE ic.company_id = $1 AND ic.invoice_id = $2
			 ORDER BY ic.id`,
			[requireCompanyId(ctx), invoiceId]
		);
		return result.rows;
	}

	/**
	 * Entregas de una orden que todavia no cubre ninguna factura viva.
	 *
	 * `is_active = 1` en el enlace es lo que hace que anular una factura libere
	 * sus entregas: la fila permanece con 0 y deja de bloquear.
	 */
	async listBillableConduces(
		ctx: RepositoryContext,
		workOrderId: ESRId,
		client?: pg.PoolClient
	): Promise<
		Array<{ id: ESRId; note_number: string; date: string | null; total: string; lineas: number }>
	> {
		const result = await this.db(client).query(
			`SELECT co.id, co.note_number, co.date, co.total::text AS total,
				(SELECT COUNT(*) FROM conduce_items ci WHERE ci.conduce_id = co.id)::int AS lineas
			 FROM conduces co
			 WHERE co.company_id = $1
			   AND co.work_order_id = $2
			   AND ${DELIVERY_ONLY}
			   AND co.status <> 'anulado'
			   AND ${NOT_BILLED}
			 ORDER BY co.id`,
			[requireCompanyId(ctx), workOrderId]
		);
		return result.rows;
	}

	/** Ordenes con alguna entrega sin facturar. Alimenta el selector de /invoices/new. */
	async listOrdersWithBillable(
		ctx: RepositoryContext
	): Promise<Array<{ id: ESRId; order_number: string; client_name: string | null; pendientes: number }>> {
		const result = await this.db().query(
			`SELECT wo.id, wo.order_number, c.name AS client_name,
				COUNT(co.id)::int AS pendientes
			 FROM work_orders wo
			 JOIN conduces co ON co.work_order_id = wo.id AND co.company_id = wo.company_id
			 LEFT JOIN clients c ON c.id = wo.client_id AND c.company_id = wo.company_id
			 WHERE wo.company_id = $1
			   AND ${DELIVERY_ONLY}
			   AND co.status <> 'anulado'
			   AND ${NOT_BILLED}
			 GROUP BY wo.id, wo.order_number, c.name
			 ORDER BY wo.id DESC
			 LIMIT 200`,
			[requireCompanyId(ctx)]
		);
		return result.rows;
	}

	/** La factura viva que cubre una entrega, si la hay. La usa la pantalla del conduce. */
	async findByConduce(ctx: RepositoryContext, conduceId: ESRId): Promise<Invoice | null> {
		const result = await this.db().query<Invoice>(
			`SELECT ${INVOICE_COLUMNS} ${INVOICE_JOINS}
			 JOIN invoice_conduces ic ON ic.invoice_id = inv.id AND ic.is_active = 1
			 WHERE inv.company_id = $1 AND ic.conduce_id = $2
			 LIMIT 1`,
			[requireCompanyId(ctx), conduceId]
		);
		return result.rows[0] ?? null;
	}

	async insertHeader(
		ctx: RepositoryContext,
		data: {
			invoice_number: string;
			work_order_id?: ESRId | null;
			client_id?: ESRId | null;
			date?: string | null;
			subtotal: number;
			discount: number;
			total: number;
			notes?: string | null;
		},
		client?: pg.PoolClient
	): Promise<Invoice> {
		const result = await this.db(client).query<Invoice>(
			`INSERT INTO invoices
				(company_id, invoice_number, work_order_id, client_id, date, status,
				 subtotal, discount, total, notes, is_active)
			 VALUES ($1, $2, $3, $4, COALESCE($5, CURRENT_DATE::TEXT), 'emitida', $6, $7, $8, $9, 1)
			 RETURNING id, invoice_number, total::text AS total`,
			[
				requireCompanyId(ctx),
				data.invoice_number,
				data.work_order_id ?? null,
				data.client_id ?? null,
				data.date || null,
				data.subtotal,
				data.discount,
				data.total,
				data.notes ?? null
			]
		);
		return result.rows[0];
	}

	async insertItem(
		ctx: RepositoryContext,
		invoiceId: ESRId,
		line: { item_id?: ESRId | null; description?: string | null; quantity: number; price: number },
		client?: pg.PoolClient
	): Promise<void> {
		await this.db(client).query(
			// Los ::numeric no son decorativos: sin ellos PostgreSQL no sabe de que
			// tipo es `$5 * $6` —dos parametros sin tipo— y responde
			// «operator is not unique: unknown * unknown».
			`INSERT INTO invoice_items (company_id, invoice_id, item_id, description, quantity, price, total)
			 VALUES ($1, $2, $3, $4, $5::numeric, $6::numeric, $5::numeric * $6::numeric)`,
			[
				requireCompanyId(ctx),
				invoiceId,
				line.item_id ?? null,
				line.description ?? null,
				line.quantity,
				line.price
			]
		);
	}

	async linkConduce(
		ctx: RepositoryContext,
		invoiceId: ESRId,
		conduceId: ESRId,
		client?: pg.PoolClient
	): Promise<void> {
		await this.db(client).query(
			`INSERT INTO invoice_conduces (company_id, invoice_id, conduce_id, is_active)
			 VALUES ($1, $2, $3, 1)`,
			[requireCompanyId(ctx), invoiceId, conduceId]
		);
	}

	/**
	 * Anula la factura y suelta sus entregas.
	 *
	 * Los pagos los anula el servicio, en la misma transaccion: aqui solo se
	 * cierra el documento.
	 */
	async cancel(
		ctx: RepositoryContext,
		id: ESRId,
		reason: string | null,
		client?: pg.PoolClient
	): Promise<Invoice> {
		const companyId = requireCompanyId(ctx);
		const result = await this.db(client).query<Invoice>(
			`UPDATE invoices
			 SET status = 'anulada', cancelled_at = NOW(), cancel_reason = $3, updated_at = NOW()
			 WHERE company_id = $1 AND id = $2 AND status <> 'anulada'
			 RETURNING id, invoice_number, total::text AS total, status`,
			[companyId, id, reason]
		);
		if (!result.rows[0]) throw new Error(`La factura ${id} no existe o ya estaba anulada.`);

		await this.db(client).query(
			`UPDATE invoice_conduces SET is_active = 0
			 WHERE company_id = $1 AND invoice_id = $2`,
			[companyId, id]
		);
		return result.rows[0];
	}

	/** Estado de circulacion: 1 activo, 2 inactivo, 0 archivado. No borra. */
	async setState(ctx: RepositoryContext, id: ESRId, state: number, client?: pg.PoolClient): Promise<void> {
		await this.db(client).query(
			`UPDATE invoices SET is_active = $3, updated_at = NOW() WHERE company_id = $1 AND id = $2`,
			[requireCompanyId(ctx), id, state]
		);
	}
}
