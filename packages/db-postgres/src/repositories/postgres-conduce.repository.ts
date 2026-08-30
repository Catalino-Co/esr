import type { RecordStateFilter, RepositoryContext } from '@esr/core';
import { DEFAULT_RECORD_STATE, requireCompanyId } from '@esr/core';
import type { Conduce, ConduceItem, ESRId } from '@esr/schemas';
import type pg from 'pg';
import { getPostgresPool } from '../connection';
import { appendStateFilter } from './state-filter';
import { appendPagination } from './pagination';

export type ConduceListFilters = {
	/** Estado de circulacion; por defecto, solo activos. */
	state?: RecordStateFilter;
	work_order_id?: ESRId;
	conduce_type?: string;
	/** Numero de conduce o cliente. */
	search?: string;
	status?: string;
	limit?: number;
	offset?: number;
};

export class PostgresConduceRepository {
	constructor(private readonly pool: pg.Pool = getPostgresPool()) {}

	private db(client?: pg.PoolClient) {
		return client ?? this.pool;
	}

	async nextNoteNumber(ctx: RepositoryContext, conduceType: string, client?: pg.PoolClient): Promise<string> {
		const prefix = conduceType === 'devolucion' ? 'DEV' : 'CON';
		const result = await this.db(client).query<{ note_number: string | null }>(
			`SELECT note_number FROM conduces
			 WHERE company_id = $1 AND note_number LIKE $2
			 ORDER BY id DESC LIMIT 1`,
			[requireCompanyId(ctx), `${prefix}-%`]
		);
		const last = result.rows[0]?.note_number;
		const next = last ? Number(last.replace(/\D/g, '')) + 1 : 1;
		return `${prefix}-${String(next).padStart(6, '0')}`;
	}

	async list(ctx: RepositoryContext, filters: ConduceListFilters = {}): Promise<Conduce[]> {
		const params: unknown[] = [requireCompanyId(ctx)];
		const where = ['company_id = $1'];
		appendStateFilter(params, where, filters.state);
		if (filters.work_order_id) {
			params.push(filters.work_order_id);
			where.push(`work_order_id = $${params.length}`);
		}
		if (filters.conduce_type) {
			params.push(filters.conduce_type);
			where.push(`conduce_type = $${params.length}`);
		}
		if (filters.status) {
			params.push(filters.status);
			where.push(`status = $${params.length}`);
		}
		if (filters.search) {
			params.push(`%${filters.search}%`);
			where.push(`note_number ILIKE $${params.length}`);
		}
		const result = await this.pool.query<Conduce>(
			`SELECT * FROM conduces WHERE ${where.join(' AND ')} ORDER BY created_at DESC${appendPagination(params, filters)}`,
			params
		);
		return result.rows;
	}

	async findById(ctx: RepositoryContext, id: ESRId, client?: pg.PoolClient): Promise<Conduce | null> {
		const result = await this.db(client).query<Conduce>(
			'SELECT * FROM conduces WHERE company_id = $1 AND id = $2',
			[requireCompanyId(ctx), id]
		);
		return result.rows[0] ?? null;
	}

	async findByWorkOrderId(ctx: RepositoryContext, workOrderId: ESRId): Promise<Conduce[]> {
		return this.list(ctx, { work_order_id: workOrderId, limit: 100, offset: 0 });
	}

	async listItems(ctx: RepositoryContext, conduceId: ESRId, client?: pg.PoolClient): Promise<ConduceItem[]> {
		const result = await this.db(client).query<ConduceItem>(
			`SELECT ci.*, i.name, i.internal_code
			 FROM conduce_items ci
			 LEFT JOIN items i ON i.id = ci.item_id AND i.company_id = ci.company_id
			 WHERE ci.company_id = $1 AND ci.conduce_id = $2 ORDER BY ci.id`,
			[requireCompanyId(ctx), conduceId]
		);
		return result.rows;
	}

	/**
	 * Crea el conduce y sus lineas.
	 *
	 * Devuelve el conduce con `line_ids`: el id de cada linea creada, indexado
	 * por `work_order_item_id`. Hace falta para colgar de ella los seriales que
	 * salieron, que es lo unico que permite deshacer la entrega despues.
	 */
	async create(
		ctx: RepositoryContext,
		data: {
			work_order_id: ESRId;
			client_id?: ESRId | null;
			conduce_type: string;
			notes?: string;
			items: Array<{
				work_order_item_id: ESRId;
				item_id: ESRId;
				quantity: number;
				price?: number;
				/** Solo en devoluciones: con que resultado volvio la linea. */
				return_condition?: string | null;
			}>;
		},
		client?: pg.PoolClient
	): Promise<Conduce & { line_ids: Map<string, ESRId> }> {
		const companyId = requireCompanyId(ctx);
		const noteNumber = await this.nextNoteNumber(ctx, data.conduce_type, client);
		const subtotal = data.items.reduce((sum, line) => sum + Number(line.quantity) * Number(line.price || 0), 0);
		const result = await this.db(client).query<Conduce>(
			`INSERT INTO conduces
				(company_id, work_order_id, client_id, note_number, conduce_type, date, status, notes, subtotal, total, is_active)
			 VALUES ($1, $2, $3, $4, $5, CURRENT_DATE::TEXT, 'emitido', $6, $7, $7, 1)
			 RETURNING *`,
			[companyId, data.work_order_id, data.client_id || null, noteNumber, data.conduce_type, data.notes || null, subtotal]
		);
		const conduce = result.rows[0];
		const lineIds = new Map<string, ESRId>();
		for (const line of data.items) {
			const inserted = await this.db(client).query<{ id: ESRId }>(
				`INSERT INTO conduce_items
					(company_id, conduce_id, work_order_item_id, item_id, quantity, price, status, return_condition)
				 VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7)
				 RETURNING id`,
				[
					companyId,
					conduce.id,
					line.work_order_item_id,
					line.item_id,
					line.quantity,
					line.price || 0,
					line.return_condition ?? null
				]
			);
			lineIds.set(String(line.work_order_item_id), inserted.rows[0].id);
		}
		return { ...conduce, line_ids: lineIds };
	}

	/**
	 * Deja constancia de que UNA unidad concreta se movio en ESTE conduce.
	 *
	 * `work_order_item_serials` guarda lo mismo pero indexado por orden, asi que
	 * con dos entregas parciales no sabe cual movio cual. Sin esta tabla no se
	 * puede deshacer la entrega de un articulo serializado.
	 */
	async linkSerial(
		ctx: RepositoryContext,
		data: { conduce_id: ESRId; conduce_item_id?: ESRId | null; item_id: ESRId; serial_id: ESRId },
		client?: pg.PoolClient
	): Promise<void> {
		await this.db(client).query(
			`INSERT INTO conduce_item_serials (company_id, conduce_id, conduce_item_id, item_id, serial_id)
			 VALUES ($1, $2, $3, $4, $5)
			 ON CONFLICT (conduce_id, serial_id) DO NOTHING`,
			[requireCompanyId(ctx), data.conduce_id, data.conduce_item_id ?? null, data.item_id, data.serial_id]
		);
	}

	/** Los seriales que movio un conduce. Vacio si es anterior a la migracion 013. */
	async listSerials(
		ctx: RepositoryContext,
		conduceId: ESRId,
		client?: pg.PoolClient
	): Promise<Array<{ item_id: ESRId; serial_id: ESRId }>> {
		const result = await this.db(client).query<{ item_id: ESRId; serial_id: ESRId }>(
			`SELECT item_id, serial_id FROM conduce_item_serials
			 WHERE company_id = $1 AND conduce_id = $2 ORDER BY id`,
			[requireCompanyId(ctx), conduceId]
		);
		return result.rows;
	}

	/**
	 * La factura viva que cubre este conduce, si la hay.
	 *
	 * Es lo que impide anularlo por detras de una factura ya emitida: si la
	 * entrega se deshiciera con la factura en pie, se estaria cobrando algo que
	 * ya no ocurrio. Primero se anula la factura, que libera la entrega.
	 */
	async billedBy(
		ctx: RepositoryContext,
		conduceId: ESRId,
		client?: pg.PoolClient
	): Promise<{ id: ESRId; invoice_number: string } | null> {
		const result = await this.db(client).query<{ id: ESRId; invoice_number: string }>(
			`SELECT inv.id, inv.invoice_number
			 FROM invoice_conduces ic
			 JOIN invoices inv ON inv.id = ic.invoice_id AND inv.company_id = ic.company_id
			 WHERE ic.company_id = $1 AND ic.conduce_id = $2 AND ic.is_active = 1
			 LIMIT 1`,
			[requireCompanyId(ctx), conduceId]
		);
		return result.rows[0] ?? null;
	}

	/**
	 * Cierra el conduce como anulado y marca sus lineas.
	 *
	 * Solo toca el DOCUMENTO. Revertir la operacion, si toca, es cosa del
	 * servicio, que lo hace en la misma transaccion.
	 */
	async cancel(
		ctx: RepositoryContext,
		conduceId: ESRId,
		data: { mode: string; reason: string },
		client?: pg.PoolClient
	): Promise<Conduce> {
		const companyId = requireCompanyId(ctx);
		const result = await this.db(client).query<Conduce>(
			`UPDATE conduces
			 SET status = 'anulado', cancelled_at = NOW(), cancel_reason = $3, cancel_mode = $4
			 WHERE company_id = $1 AND id = $2 AND status <> 'anulado'
			 RETURNING *`,
			[companyId, conduceId, data.reason, data.mode]
		);
		if (!result.rows[0]) throw new Error('El conduce no existe o ya estaba anulado.');

		await this.db(client).query(
			`UPDATE conduce_items SET status = 'anulado' WHERE company_id = $1 AND conduce_id = $2`,
			[companyId, conduceId]
		);
		return result.rows[0];
	}

	/**
	 * Las devoluciones VIVAS que siguen afectando a una linea de la orden, con
	 * su condicion. Sirve para recalcular el estado del articulo cuando se anula
	 * una de varias devoluciones: sin esto, deshacer la segunda dejaria el
	 * articulo como «devuelto» aunque la primera lo hubiese marcado «dañado».
	 */
	async listLiveReturnConditions(
		ctx: RepositoryContext,
		workOrderItemId: ESRId,
		exceptConduceId: ESRId,
		client?: pg.PoolClient
	): Promise<string[]> {
		const result = await this.db(client).query<{ return_condition: string | null }>(
			`SELECT ci.return_condition
			 FROM conduce_items ci
			 JOIN conduces co ON co.id = ci.conduce_id AND co.company_id = ci.company_id
			 WHERE ci.company_id = $1
			   AND ci.work_order_item_id = $2
			   AND ci.conduce_id <> $3
			   AND co.conduce_type = 'devolucion'
			   AND co.status <> 'anulado'`,
			[requireCompanyId(ctx), workOrderItemId, exceptConduceId]
		);
		return result.rows.map((row) => row.return_condition ?? 'devuelto');
	}

	/** Los movimientos de stock que escribio un conduce, para compensarlos. */
	async listStockMovements(
		ctx: RepositoryContext,
		conduceId: ESRId,
		client?: pg.PoolClient
	): Promise<Array<{ item_id: ESRId; work_order_item_id: ESRId | null; type: string; quantity: number }>> {
		const result = await this.db(client).query(
			`SELECT item_id, work_order_item_id, type, quantity
			 FROM stock_movements
			 WHERE company_id = $1 AND reference = $2
			 ORDER BY id`,
			[requireCompanyId(ctx), `conduce:${conduceId}`]
		);
		return result.rows;
	}

	async complete(
		ctx: RepositoryContext,
		conduceId: ESRId,
		data: { received_by_name?: string; received_by_document?: string; notes?: string },
		client?: pg.PoolClient
	): Promise<Conduce> {
		const result = await this.db(client).query<Conduce>(
			`UPDATE conduces SET status = 'completado', completed_at = NOW(),
				received_by_name = COALESCE($3, received_by_name),
				received_by_document = COALESCE($4, received_by_document),
				notes = COALESCE($5, notes)
			 WHERE company_id = $1 AND id = $2 RETURNING *`,
			[requireCompanyId(ctx), conduceId, data.received_by_name || null, data.received_by_document || null, data.notes || null]
		);
		if (!result.rows[0]) throw new Error(`Conduce ${conduceId} not found.`);
		await this.db(client).query(
			`UPDATE conduce_items SET status = 'completed'
			 WHERE company_id = $1 AND conduce_id = $2`,
			[requireCompanyId(ctx), conduceId]
		);
		return result.rows[0];
	}
}
