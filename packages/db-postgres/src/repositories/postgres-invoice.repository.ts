import type { RecordStateFilter, RepositoryContext } from '@esr/core';
import { requireCompanyId } from '@esr/core';
import type { ESRId, Invoice, InvoiceConduce, InvoiceItem, InvoiceQuotationItem } from '@esr/schemas';
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
	quotation_id?: ESRId;
	/** Numero de factura o nombre de cliente. */
	search?: string;
	/** `YYYY-MM-DD`, ambos inclusive. Ver el docblock de `list()`. */
	date_from?: string;
	date_to?: string;
	limit?: number;
	offset?: number;
};

/**
 * Los importes salen como TEXTO. El driver de PostgreSQL entrega un NUMERIC
 * como float y ahi es donde se pierden los centavos; `summarizePayments` ya
 * acepta string y redondea a dos decimales.
 */
const INVOICE_COLUMNS = `
	inv.id, inv.company_id, inv.invoice_number, inv.work_order_id, inv.quotation_id, inv.client_id,
	inv.date, inv.status,
	inv.subtotal::text AS subtotal, inv.discount::text AS discount,
	inv.tax_amount::text AS tax_amount, inv.total::text AS total,
	inv.notes, inv.cancelled_at, inv.cancel_reason, inv.is_active,
	inv.created_at, inv.updated_at,
	c.name AS client_name, wo.order_number, q.quote_number
`;

const INVOICE_JOINS = `
	FROM invoices inv
	LEFT JOIN clients c ON c.id = inv.client_id AND c.company_id = inv.company_id
	LEFT JOIN work_orders wo ON wo.id = inv.work_order_id AND wo.company_id = inv.company_id
	LEFT JOIN quotations q ON q.id = inv.quotation_id AND q.company_id = inv.company_id
`;

/** Solo las entregas se facturan: una devolucion no se cobra. */
const DELIVERY_ONLY = "co.conduce_type <> 'devolucion'";

/** Entregas que todavia no cubre ninguna factura viva. */
const NOT_BILLED = `NOT EXISTS (
	SELECT 1 FROM invoice_conduces ic
	WHERE ic.conduce_id = co.id AND ic.is_active = 1
)`;

/**
 * Lineas de Servicio que todavia no cubre ninguna factura viva.
 *
 * Un Servicio no es tangible: nunca genera un conduce, asi que no puede
 * facturarse por el camino de arriba. Este es su espejo, sobre
 * `invoice_work_order_items` en vez de `invoice_conduces` -mismo mecanismo
 * de "un enlace activo a la vez", para que anular la factura libere la
 * linea y se pueda volver a facturar-.
 */
const SERVICE_NOT_BILLED = `NOT EXISTS (
	SELECT 1 FROM invoice_work_order_items iwi
	WHERE iwi.work_order_item_id = woi.id AND iwi.is_active = 1
)`;

/** Cuanto de una linea de cotizacion cubre ya alguna factura viva. */
const QUOTE_LINE_BILLED_QTY = `COALESCE((
	SELECT SUM(iqi.quantity) FROM invoice_quotation_items iqi
	WHERE iqi.quotation_item_id = qi.id AND iqi.is_active = 1
), 0)`;

/**
 * Lo que queda por facturar de una linea de cotizacion.
 *
 * A diferencia de `NOT_BILLED`/`SERVICE_NOT_BILLED` -que son un si/no-, una
 * cotizacion se factura POR PARTES: lo que importa es la cantidad que
 * sobra, no si alguna vez se facturo algo de esa linea.
 */
const QUOTE_LINE_REMAINING = `(qi.quantity - ${QUOTE_LINE_BILLED_QTY})`;
const QUOTE_LINE_NOT_BILLED = `${QUOTE_LINE_REMAINING} > 0`;

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

		for (const field of ['status', 'client_id', 'work_order_id', 'quotation_id'] as const) {
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

		/*
		 * La ventana de fechas.
		 *
		 * `inv.date` es TEXT `YYYY-MM-DD`, comparacion lexicografica correcta con
		 * ceros a la izquierda. `date IS NULL` nunca se descarta: una factura sin
		 * fecha no debe desaparecer sin que nada lo diga. Gemelo del de
		 * `postgres-quote.repository.ts` y `postgres-rental.repository.ts`.
		 *
		 * El `ORDER BY` no cambia: sigue siendo `inv.id DESC`. Esto solo filtra.
		 */
		if (filters.date_from) {
			params.push(filters.date_from);
			where.push(`(inv.date IS NULL OR inv.date >= $${params.length})`);
		}
		if (filters.date_to) {
			params.push(filters.date_to);
			where.push(`(inv.date IS NULL OR inv.date <= $${params.length})`);
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

	/**
	 * Buscar por numero, sin filtro de estado ni de circulacion: si se busca por
	 * numero es porque se sabe cual es, y una anulada tiene que aparecer.
	 * `invoice_number` es NOT NULL, asi que a diferencia de
	 * `postgres-rental.repository.ts` no hace falta el respaldo `OR id::text = $2`.
	 */
	async searchByNumber(ctx: RepositoryContext, termino: string, limite = 10): Promise<Invoice[]> {
		const result = await this.pool.query<Invoice>(
			`SELECT ${INVOICE_COLUMNS} ${INVOICE_JOINS}
			 WHERE inv.company_id = $1 AND inv.invoice_number ILIKE '%' || $2 || '%'
			 ORDER BY
			   (lower(inv.invoice_number) = lower($2)) DESC,
			   (inv.invoice_number ILIKE $2 || '%') DESC,
			   inv.date DESC NULLS LAST, inv.id DESC
			 LIMIT $3`,
			[requireCompanyId(ctx), termino, Math.min(50, Math.max(1, limite))]
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
			`SELECT ii.id, ii.company_id, ii.invoice_id, ii.item_id, ii.service_id, ii.description,
				ii.quantity::text AS quantity, ii.price::text AS price, ii.total::text AS total,
				ii.discount_rate::text AS discount_rate, ii.tax_rate::text AS tax_rate,
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

	/**
	 * Lineas de Servicio de una orden que todavia no cubre ninguna factura
	 * viva. Un Servicio se factura una sola vez -no hay entrega parcial que
	 * valga-, asi que basta con listar la linea entera.
	 */
	async listBillableServices(
		ctx: RepositoryContext,
		workOrderId: ESRId,
		client?: pg.PoolClient
	): Promise<Array<{ id: ESRId; service_id: ESRId; name: string; quantity: string; price: string }>> {
		const result = await this.db(client).query(
			`SELECT woi.id, woi.service_id, s.name,
				woi.quantity::text AS quantity, woi.price::text AS price
			 FROM work_order_items woi
			 JOIN services s ON s.id = woi.service_id AND s.company_id = woi.company_id
			 WHERE woi.company_id = $1 AND woi.work_order_id = $2 AND ${SERVICE_NOT_BILLED}
			 ORDER BY woi.id`,
			[requireCompanyId(ctx), workOrderId]
		);
		return result.rows;
	}

	/**
	 * Lineas de una cotizacion con cantidad pendiente de facturar DIRECTO.
	 *
	 * Deja fuera las lineas de paquete heredadas (`package_id` sin `item_id` ni
	 * `service_id`): son el mismo caso que ya descarta la conversion a orden, y
	 * no tienen nada que facturar por si solas.
	 */
	async listBillableQuotationItems(
		ctx: RepositoryContext,
		quotationId: ESRId,
		client?: pg.PoolClient
	): Promise<
		Array<{
			id: ESRId;
			item_id: ESRId | null;
			service_id: ESRId | null;
			name: string | null;
			internal_code: string | null;
			quantity: string;
			billed_quantity: string;
			remaining: string;
			price: string;
			discount_rate: string;
			tax_rate: string;
		}>
	> {
		const result = await this.db(client).query(
			`SELECT qi.id, qi.item_id, qi.service_id,
				COALESCE(qi.name, i.name, s.name) AS name, i.internal_code,
				qi.quantity::text AS quantity,
				(${QUOTE_LINE_BILLED_QTY})::text AS billed_quantity,
				(${QUOTE_LINE_REMAINING})::text AS remaining,
				qi.price::text AS price,
				COALESCE(qi.discount_rate, 0)::text AS discount_rate,
				COALESCE(qi.tax_rate, 0)::text AS tax_rate
			 FROM quotation_items qi
			 LEFT JOIN items i ON i.id = qi.item_id AND i.company_id = qi.company_id
			 LEFT JOIN services s ON s.id = qi.service_id AND s.company_id = qi.company_id
			 WHERE qi.company_id = $1 AND qi.quotation_id = $2
			   AND (qi.item_id IS NOT NULL OR qi.service_id IS NOT NULL)
			   AND ${QUOTE_LINE_NOT_BILLED}
			 ORDER BY qi.id`,
			[requireCompanyId(ctx), quotationId]
		);
		return result.rows;
	}

	/**
	 * Bloquea las lineas elegidas hasta el fin de la transaccion.
	 *
	 * Es lo que impide que dos emisiones simultaneas de la misma cotizacion se
	 * repartan mas cantidad de la que en realidad queda -el indice de
	 * `invoice_quotation_items` no es unico, asi que sin este lock la carrera
	 * la ganaria quien llegue de ultimo, no quien de verdad tenia cupo-.
	 */
	async lockQuotationItems(
		ctx: RepositoryContext,
		quotationItemIds: readonly ESRId[],
		client: pg.PoolClient
	): Promise<void> {
		if (!quotationItemIds.length) return;
		await client.query(
			`SELECT id FROM quotation_items WHERE company_id = $1 AND id = ANY($2::bigint[]) FOR UPDATE`,
			[requireCompanyId(ctx), quotationItemIds]
		);
	}

	/** Vincula una linea de cotizacion facturada DIRECTO, con cuanto se factura. Espejo de `linkWorkOrderItem`. */
	async linkQuotationItem(
		ctx: RepositoryContext,
		invoiceId: ESRId,
		quotationItemId: ESRId,
		quantity: number,
		client?: pg.PoolClient
	): Promise<void> {
		await this.db(client).query(
			`INSERT INTO invoice_quotation_items (company_id, invoice_id, quotation_item_id, quantity, is_active)
			 VALUES ($1, $2, $3, $4, 1)`,
			[requireCompanyId(ctx), invoiceId, quotationItemId, quantity]
		);
	}

	/** Los enlaces de cotizacion de la factura, los liberados por una anulacion incluidos. */
	async listQuotationItems(
		ctx: RepositoryContext,
		invoiceId: ESRId,
		client?: pg.PoolClient
	): Promise<InvoiceQuotationItem[]> {
		const result = await this.db(client).query<InvoiceQuotationItem>(
			`SELECT iqi.id, iqi.invoice_id, iqi.quotation_item_id, iqi.quantity::text AS quantity, iqi.is_active,
				COALESCE(qi.name, i.name, s.name) AS name
			 FROM invoice_quotation_items iqi
			 JOIN quotation_items qi ON qi.id = iqi.quotation_item_id AND qi.company_id = iqi.company_id
			 LEFT JOIN items i ON i.id = qi.item_id AND i.company_id = qi.company_id
			 LEFT JOIN services s ON s.id = qi.service_id AND s.company_id = qi.company_id
			 WHERE iqi.company_id = $1 AND iqi.invoice_id = $2
			 ORDER BY iqi.id`,
			[requireCompanyId(ctx), invoiceId]
		);
		return result.rows;
	}

	/**
	 * Cuanto se ha facturado DIRECTO de cada linea de una cotizacion.
	 *
	 * La usa `QuoteConversionService.convertToWorkOrder` para restar lo ya
	 * facturado antes de crear la orden con lo que queda -sin esto, esa
	 * cantidad se entregaria, conduciria y facturaria otra vez por el camino
	 * normal-.
	 */
	async listBilledQuantitiesByQuotation(
		ctx: RepositoryContext,
		quotationId: ESRId,
		client?: pg.PoolClient
	): Promise<Map<string, number>> {
		const result = await this.db(client).query<{ quotation_item_id: string; quantity: string }>(
			`SELECT iqi.quotation_item_id, SUM(iqi.quantity)::text AS quantity
			 FROM invoice_quotation_items iqi
			 JOIN quotation_items qi ON qi.id = iqi.quotation_item_id AND qi.company_id = iqi.company_id
			 WHERE iqi.company_id = $1 AND qi.quotation_id = $2 AND iqi.is_active = 1
			 GROUP BY iqi.quotation_item_id`,
			[requireCompanyId(ctx), quotationId]
		);
		return new Map(result.rows.map((row) => [String(row.quotation_item_id), Number(row.quantity)]));
	}

	/** Cotizaciones aprobadas con algo pendiente de facturar directo. Espejo de `listOrdersWithBillable`. */
	async listQuotationsWithBillable(
		ctx: RepositoryContext
	): Promise<
		Array<{
			id: ESRId;
			quote_number: string | null;
			client_id: ESRId | null;
			client_name: string | null;
			date: string | null;
			pendientes: number;
			total_pendiente: string;
		}>
	> {
		const pendientes = `(SELECT COUNT(*) FROM quotation_items qi
			WHERE qi.quotation_id = q.id AND qi.company_id = q.company_id
			  AND (qi.item_id IS NOT NULL OR qi.service_id IS NOT NULL) AND ${QUOTE_LINE_NOT_BILLED})`;
		const totalPendiente = `(SELECT COALESCE(SUM(${QUOTE_LINE_REMAINING} * qi.price), 0) FROM quotation_items qi
			WHERE qi.quotation_id = q.id AND qi.company_id = q.company_id
			  AND (qi.item_id IS NOT NULL OR qi.service_id IS NOT NULL) AND ${QUOTE_LINE_NOT_BILLED})`;
		const result = await this.db().query(
			`SELECT q.id, q.quote_number, q.client_id, c.name AS client_name, q.date,
				(${pendientes})::int AS pendientes,
				(${totalPendiente})::text AS total_pendiente
			 FROM quotations q
			 LEFT JOIN clients c ON c.id = q.client_id AND c.company_id = q.company_id
			 WHERE q.company_id = $1 AND q.status = 'aprobada' AND q.is_active = 1
			   AND (${pendientes}) > 0
			 ORDER BY q.id DESC
			 LIMIT 200`,
			[requireCompanyId(ctx)]
		);
		return result.rows;
	}

	/** Ordenes con alguna entrega o servicio sin facturar. Alimenta el selector de /invoices/new. */
	async listOrdersWithBillable(
		ctx: RepositoryContext
	): Promise<Array<{ id: ESRId; order_number: string; client_name: string | null; pendientes: number }>> {
		const conducesPendientes = `(SELECT COUNT(*) FROM conduces co
			WHERE co.work_order_id = wo.id AND co.company_id = wo.company_id
			  AND ${DELIVERY_ONLY} AND co.status <> 'anulado' AND ${NOT_BILLED})`;
		const serviciosPendientes = `(SELECT COUNT(*) FROM work_order_items woi
			WHERE woi.work_order_id = wo.id AND woi.company_id = wo.company_id
			  AND woi.service_id IS NOT NULL AND ${SERVICE_NOT_BILLED})`;
		const result = await this.db().query(
			`SELECT wo.id, wo.order_number, c.name AS client_name,
				(${conducesPendientes} + ${serviciosPendientes})::int AS pendientes
			 FROM work_orders wo
			 LEFT JOIN clients c ON c.id = wo.client_id AND c.company_id = wo.company_id
			 WHERE wo.company_id = $1
			   AND (${conducesPendientes} > 0 OR ${serviciosPendientes} > 0)
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
			quotation_id?: ESRId | null;
			client_id?: ESRId | null;
			date?: string | null;
			subtotal: number;
			discount: number;
			tax_amount: number;
			total: number;
			notes?: string | null;
		},
		client?: pg.PoolClient
	): Promise<Invoice> {
		const result = await this.db(client).query<Invoice>(
			`INSERT INTO invoices
				(company_id, invoice_number, work_order_id, quotation_id, client_id, date, status,
				 subtotal, discount, tax_amount, total, notes, is_active)
			 VALUES ($1, $2, $3, $4, $5, COALESCE($6, CURRENT_DATE::TEXT), 'emitida', $7, $8, $9, $10, $11, 1)
			 RETURNING id, invoice_number, total::text AS total`,
			[
				requireCompanyId(ctx),
				data.invoice_number,
				data.work_order_id ?? null,
				data.quotation_id ?? null,
				data.client_id ?? null,
				data.date || null,
				data.subtotal,
				data.discount,
				data.tax_amount,
				data.total,
				data.notes ?? null
			]
		);
		return result.rows[0];
	}

	async insertItem(
		ctx: RepositoryContext,
		invoiceId: ESRId,
		line: {
			item_id?: ESRId | null;
			service_id?: ESRId | null;
			description?: string | null;
			quantity: number;
			price: number;
			discount_rate?: number;
			tax_rate?: number;
		},
		client?: pg.PoolClient
	): Promise<void> {
		await this.db(client).query(
			// Los ::numeric no son decorativos: sin ellos PostgreSQL no sabe de que
			// tipo es `$6 * $7` —dos parametros sin tipo— y responde
			// «operator is not unique: unknown * unknown». `total` sigue siendo el
			// BRUTO (cantidad x precio): el descuento/impuesto de linea se derivan
			// de `discount_rate`/`tax_rate` al leer, con `calculateQuoteLineAmounts`.
			`INSERT INTO invoice_items
				(company_id, invoice_id, item_id, service_id, description, quantity, price, total, discount_rate, tax_rate)
			 VALUES ($1, $2, $3, $4, $5, $6::numeric, $7::numeric, $6::numeric * $7::numeric, $8, $9)`,
			[
				requireCompanyId(ctx),
				invoiceId,
				line.item_id ?? null,
				line.service_id ?? null,
				line.description ?? null,
				line.quantity,
				line.price,
				line.discount_rate ?? 0,
				line.tax_rate ?? 0
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

	/** Vincula una linea de Servicio facturada. Espejo de `linkConduce`. */
	async linkWorkOrderItem(
		ctx: RepositoryContext,
		invoiceId: ESRId,
		workOrderItemId: ESRId,
		client?: pg.PoolClient
	): Promise<void> {
		await this.db(client).query(
			`INSERT INTO invoice_work_order_items (company_id, invoice_id, work_order_item_id, is_active)
			 VALUES ($1, $2, $3, 1)`,
			[requireCompanyId(ctx), invoiceId, workOrderItemId]
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
		await this.db(client).query(
			`UPDATE invoice_work_order_items SET is_active = 0
			 WHERE company_id = $1 AND invoice_id = $2`,
			[companyId, id]
		);
		await this.db(client).query(
			`UPDATE invoice_quotation_items SET is_active = 0
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
