import type { RentalOrderListFilters, RepositoryContext, TenantCreateRentalOrderInput, TenantRentalOrderRepository } from '@esr/core';
import { requireCompanyId } from '@esr/core';
import type { ESRId, Quote, QuoteItem, RentalOrder, RentalOrderItem } from '@esr/schemas';
import type pg from 'pg';
import { getPostgresPool } from '../connection';
import { appendPagination } from './pagination';

export class PostgresRentalRepository implements TenantRentalOrderRepository {
	constructor(private readonly pool: pg.Pool = getPostgresPool()) {}

	private queryClient(client?: pg.PoolClient): Pick<pg.Pool, 'query'> {
		return client ?? this.pool;
	}

	async nextOrderNumber(ctx: RepositoryContext, client?: pg.PoolClient): Promise<string> {
		const result = await this.queryClient(client).query<{ order_number: string | null }>(
			`SELECT order_number FROM work_orders
			 WHERE company_id = $1 AND order_number IS NOT NULL
			 ORDER BY id DESC LIMIT 1`,
			[requireCompanyId(ctx)]
		);
		const last = result.rows[0]?.order_number;
		const next = last ? Number(last.replace(/\D/g, '')) + 1 : 1;
		return `ORD-${String(next).padStart(6, '0')}`;
	}

	async findByQuotationId(ctx: RepositoryContext, quotationId: ESRId): Promise<RentalOrder | null> {
		const result = await this.pool.query<RentalOrder>(
			'SELECT * FROM work_orders WHERE company_id = $1 AND quotation_id = $2 LIMIT 1',
			[requireCompanyId(ctx), quotationId]
		);
		return result.rows[0] ?? null;
	}

	async createFromQuote(
		ctx: RepositoryContext,
		quote: Quote,
		items: QuoteItem[],
		client?: pg.PoolClient
	): Promise<RentalOrder> {
		const companyId = requireCompanyId(ctx);
		const db = this.queryClient(client);
		const orderNumber = await this.nextOrderNumber(ctx, client);
		const result = await db.query<RentalOrder>(
			`INSERT INTO work_orders
				(company_id, client_id, event_id, quotation_id, order_number, date,
				 subtotal, discount, tax_amount, total, notes, status, confirmed_at, is_active)
			 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW(), 1)
			 RETURNING *`,
			[
				companyId,
				quote.client_id,
				quote.event_id || null,
				quote.id,
				orderNumber,
				quote.date || new Date().toISOString().slice(0, 10),
				quote.subtotal ?? 0,
				quote.discount ?? 0,
				quote.tax_amount ?? 0,
				quote.total ?? 0,
				quote.notes || null,
				'confirmado'
			]
		);
		const order = result.rows[0];

		for (const item of items) {
			if (!item.item_id) continue;
			const lineTotal = Number(item.total || Number(item.quantity) * Number(item.price));
			await db.query(
				`INSERT INTO work_order_items
					(company_id, work_order_id, item_id, quantity, price, line_total, start_date, end_date, status)
				 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'reserved')`,
				[
					companyId,
					order.id,
					item.item_id,
					item.quantity,
					item.price,
					lineTotal,
					item.start_date || null,
					item.end_date || null
				]
			);
			await db.query(
				`INSERT INTO work_order_stock_reservations
					(company_id, work_order_id, item_id, quantity, status, start_date, end_date)
				 VALUES ($1, $2, $3, $4, 'reserved', $5, $6)
				 ON CONFLICT (work_order_id, item_id)
				 DO UPDATE SET quantity = EXCLUDED.quantity, status = 'reserved',
					start_date = EXCLUDED.start_date, end_date = EXCLUDED.end_date`,
				[companyId, order.id, item.item_id, item.quantity, item.start_date || null, item.end_date || null]
			);
		}

		return order;
	}

	async cancelOrder(ctx: RepositoryContext, id: ESRId): Promise<RentalOrder> {
		const companyId = requireCompanyId(ctx);
		const client = await this.pool.connect();
		try {
			await client.query('BEGIN');
			await client.query(
				`UPDATE work_order_stock_reservations SET status = 'cancelled'
				 WHERE company_id = $1 AND work_order_id = $2`,
				[companyId, id]
			);
			const result = await client.query<RentalOrder>(
				`UPDATE work_orders SET status = 'cancelado', cancelled_at = NOW()
				 WHERE company_id = $1 AND id = $2 RETURNING *`,
				[companyId, id]
			);
			if (!result.rows[0]) throw new Error(`Work order ${id} not found in company.`);
			await client.query('COMMIT');
			return result.rows[0];
		} catch (error) {
			await client.query('ROLLBACK');
			throw error;
		} finally {
			client.release();
		}
	}

	async closeOrder(ctx: RepositoryContext, id: ESRId): Promise<RentalOrder> {
		const result = await this.pool.query<RentalOrder>(
			`UPDATE work_orders SET status = 'cerrado', closed_at = NOW()
			 WHERE company_id = $1 AND id = $2 RETURNING *`,
			[requireCompanyId(ctx), id]
		);
		if (!result.rows[0]) throw new Error(`Work order ${id} not found in company.`);
		return result.rows[0];
	}

	async changeStatus(ctx: RepositoryContext, id: ESRId, status: string, client?: pg.PoolClient): Promise<RentalOrder> {
		const result = await this.queryClient(client).query<RentalOrder>(
			`UPDATE work_orders SET status = $3 WHERE company_id = $1 AND id = $2 RETURNING *`,
			[requireCompanyId(ctx), id, status]
		);
		if (!result.rows[0]) throw new Error(`Work order ${id} not found in company.`);
		return result.rows[0];
	}

	async closeOrderValidated(ctx: RepositoryContext, id: ESRId): Promise<RentalOrder> {
		const order = await this.findById(ctx, id);
		if (!order) throw new Error(`Work order ${id} not found in company.`);
		if (order.status !== 'devuelto') throw new Error('Order must be in devuelto status to close.');
		return this.closeOrder(ctx, id);
	}

	async findById(ctx: RepositoryContext, id: ESRId): Promise<RentalOrder | null> {
		const result = await this.pool.query<RentalOrder>(
			'SELECT * FROM work_orders WHERE company_id = $1 AND id = $2', [requireCompanyId(ctx), id]
		);
		return result.rows[0] ?? null;
	}

	async list(ctx: RepositoryContext, filters: RentalOrderListFilters = {}): Promise<RentalOrder[]> {
		const params: unknown[] = [requireCompanyId(ctx)];
		const where = ['wo.company_id = $1'];
		if (filters.search) {
			params.push(`%${filters.search}%`);
			where.push(`(c.name ILIKE $${params.length} OR wo.responsible_person ILIKE $${params.length})`);
		}
		if (filters.status) { params.push(filters.status); where.push(`wo.status = $${params.length}`); }
		if (filters.date) { params.push(filters.date); where.push(`wo.date = $${params.length}`); }
		const result = await this.pool.query<RentalOrder>(
			`SELECT wo.* FROM work_orders wo
			 LEFT JOIN clients c ON c.id = wo.client_id AND c.company_id = wo.company_id
			 WHERE ${where.join(' AND ')} ORDER BY wo.date DESC, wo.id DESC${appendPagination(params, filters)}`, params
		);
		return result.rows;
	}

	async create(ctx: RepositoryContext, data: TenantCreateRentalOrderInput): Promise<RentalOrder> {
		const companyId = requireCompanyId(ctx);
		const result = await this.pool.query<RentalOrder>(
			`INSERT INTO work_orders
				(company_id, client_id, event_id, quotation_id, date, responsible_person, vehicle, notes, status)
			 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
			[
				companyId, data.client_id || null, data.event_id || null, data.quotation_id || null,
				data.date || null, data.responsible_person || null, data.vehicle || null,
				data.notes || null, data.status || 'pendiente'
			]
		);
		await this.replaceItems(ctx, result.rows[0].id as ESRId, data.items || []);
		return result.rows[0];
	}

	async update(ctx: RepositoryContext, id: ESRId, data: Partial<TenantCreateRentalOrderInput>): Promise<RentalOrder> {
		const current = await this.findById(ctx, id);
		if (!current) throw new Error(`Rental order ${id} not found in company.`);
		const next = { ...current, ...data };
		const result = await this.pool.query<RentalOrder>(
			`UPDATE work_orders SET client_id = $3, event_id = $4, quotation_id = $5, date = $6,
				responsible_person = $7, vehicle = $8, notes = $9, status = $10
			 WHERE company_id = $1 AND id = $2 RETURNING *`,
			[
				requireCompanyId(ctx), id, next.client_id || null, next.event_id || null,
				next.quotation_id || null, next.date || null, next.responsible_person || null,
				next.vehicle || null, next.notes || null, next.status || 'pendiente'
			]
		);
		if (data.items) await this.replaceItems(ctx, id, data.items);
		return result.rows[0];
	}

	async deactivate(ctx: RepositoryContext, id: ESRId): Promise<void> {
		await this.pool.query('UPDATE work_orders SET is_active = 0 WHERE company_id = $1 AND id = $2', [
			requireCompanyId(ctx), id
		]);
	}

	async updateItemsStatus(
		ctx: RepositoryContext,
		orderId: ESRId,
		status: string,
		client?: pg.PoolClient
	): Promise<void> {
		await this.queryClient(client).query(
			`UPDATE work_order_items SET status = $3
			 WHERE company_id = $1 AND work_order_id = $2 AND status NOT IN ('cancelado')`,
			[requireCompanyId(ctx), orderId, status]
		);
	}

	async updateItemQuantities(
		ctx: RepositoryContext,
		orderId: ESRId,
		itemId: ESRId,
		data: { delivered_quantity?: number; returned_quantity?: number; status?: string },
		client?: pg.PoolClient
	): Promise<void> {
		const sets: string[] = [];
		const params: unknown[] = [requireCompanyId(ctx), itemId, orderId];
		if (data.delivered_quantity != null) {
			params.push(data.delivered_quantity);
			sets.push(`delivered_quantity = $${params.length}`);
		}
		if (data.returned_quantity != null) {
			params.push(data.returned_quantity);
			sets.push(`returned_quantity = $${params.length}`);
		}
		if (data.status) {
			params.push(data.status);
			sets.push(`status = $${params.length}`);
		}
		if (!sets.length) return;
		await this.queryClient(client).query(
			`UPDATE work_order_items SET ${sets.join(', ')}
			 WHERE company_id = $1 AND id = $2 AND work_order_id = $3`,
			params
		);
	}

	async listItems(ctx: RepositoryContext, orderId: ESRId): Promise<RentalOrderItem[]> {
		const result = await this.pool.query<RentalOrderItem>(
			`SELECT woi.id, woi.company_id, woi.work_order_id, woi.item_id,
				i.name, i.internal_code, woi.quantity, woi.delivered_quantity, woi.returned_quantity,
				woi.price, woi.line_total, woi.status, woi.start_date, woi.end_date
			 FROM work_order_items woi
			 LEFT JOIN items i ON i.id = woi.item_id AND i.company_id = woi.company_id
			 WHERE woi.company_id = $1 AND woi.work_order_id = $2`,
			[requireCompanyId(ctx), orderId]
		);
		return result.rows;
	}

	async replaceItems(ctx: RepositoryContext, orderId: ESRId, items: RentalOrderItem[]): Promise<void> {
		const companyId = requireCompanyId(ctx);
		const client = await this.pool.connect();
		try {
			await client.query('BEGIN');
			const order = await client.query(
				'SELECT id FROM work_orders WHERE company_id = $1 AND id = $2 FOR UPDATE', [companyId, orderId]
			);
			if (!order.rowCount) throw new Error(`Rental order ${orderId} not found in company.`);
			await client.query(
				'DELETE FROM work_order_items WHERE company_id = $1 AND work_order_id = $2', [companyId, orderId]
			);
			for (const item of items) {
				await client.query(
					`INSERT INTO work_order_items (company_id, work_order_id, item_id, quantity)
					 VALUES ($1, $2, $3, $4)`, [companyId, orderId, item.item_id, item.quantity]
				);
			}
			await client.query('COMMIT');
		} catch (error) {
			await client.query('ROLLBACK');
			throw error;
		} finally {
			client.release();
		}
	}
}

