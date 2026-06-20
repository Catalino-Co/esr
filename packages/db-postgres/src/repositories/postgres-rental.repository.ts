import type { RentalOrderListFilters, RepositoryContext, TenantCreateRentalOrderInput, TenantRentalOrderRepository } from '@esr/core';
import { requireCompanyId } from '@esr/core';
import type { ESRId, RentalOrder, RentalOrderItem } from '@esr/schemas';
import type pg from 'pg';
import { getPostgresPool } from '../connection';
import { appendPagination } from './pagination';

export class PostgresRentalRepository implements TenantRentalOrderRepository {
	constructor(private readonly pool: pg.Pool = getPostgresPool()) {}

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

	async listItems(ctx: RepositoryContext, orderId: ESRId): Promise<RentalOrderItem[]> {
		const result = await this.pool.query<RentalOrderItem>(
			`SELECT woi.id, woi.company_id, woi.work_order_id, woi.item_id,
				i.name, i.internal_code, woi.quantity
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

