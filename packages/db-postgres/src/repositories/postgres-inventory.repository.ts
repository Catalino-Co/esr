import type { AvailabilityInput, InventoryAvailability, InventoryListFilters, RecordState, RepositoryContext, TenantCreateInventoryItemInput, TenantInventoryRepository } from '@esr/core';
import { DEFAULT_RECORD_STATE, requireCompanyId } from '@esr/core';
import type { ESRId, InventoryItem } from '@esr/schemas';
import type pg from 'pg';
import { getPostgresPool } from '../connection';
import { appendStateFilter } from './state-filter';
import { appendPagination } from './pagination';

export class PostgresInventoryRepository implements TenantInventoryRepository {
	constructor(private readonly pool: pg.Pool = getPostgresPool()) {}

	async findById(ctx: RepositoryContext, id: ESRId): Promise<InventoryItem | null> {
		const result = await this.pool.query<InventoryItem>(
			'SELECT * FROM items WHERE company_id = $1 AND id = $2', [requireCompanyId(ctx), id]
		);
		return result.rows[0] ?? null;
	}

	async list(ctx: RepositoryContext, filters: InventoryListFilters = {}): Promise<InventoryItem[]> {
		const params: unknown[] = [requireCompanyId(ctx)];
		const where = ['company_id = $1'];
		if (filters.search) {
			params.push(`%${filters.search}%`);
			where.push(`(name ILIKE $${params.length} OR internal_code ILIKE $${params.length})`);
		}
		if (filters.status) { params.push(filters.status); where.push(`status = $${params.length}`); }
		if (filters.category_id) { params.push(filters.category_id); where.push(`category_id = $${params.length}`); }
		// Sin estado explicito se listan solo los activos.
		appendStateFilter(params, where, filters.state);
		const result = await this.pool.query<InventoryItem>(
			`SELECT * FROM items WHERE ${where.join(' AND ')} ORDER BY name${appendPagination(params, filters)}`, params
		);
		return result.rows;
	}

	async create(ctx: RepositoryContext, data: TenantCreateInventoryItemInput): Promise<InventoryItem> {
		const result = await this.pool.query<InventoryItem>(
			`INSERT INTO items
				(company_id, internal_code, name, category_id, subcategory_id, description, item_type,
				 uses_serial, total_quantity, available_quantity, rental_price, status, notes, is_active)
			 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
			 RETURNING *`,
			[
				requireCompanyId(ctx), data.internal_code || null, data.name, data.category_id || null,
				data.subcategory_id || null, data.description || null, data.item_type || 'cantidad',
				data.uses_serial ? 1 : 0, data.total_quantity ?? 0, data.available_quantity ?? 0,
				data.rental_price ?? 0, data.status || 'disponible', data.notes || null, data.is_active ?? 1
			]
		);
		return result.rows[0];
	}

	async update(ctx: RepositoryContext, id: ESRId, data: Partial<TenantCreateInventoryItemInput>): Promise<InventoryItem> {
		const current = await this.findById(ctx, id);
		if (!current) throw new Error(`Inventory item ${id} not found in company.`);
		const next = { ...current, ...data };
		const result = await this.pool.query<InventoryItem>(
			`UPDATE items SET internal_code = $3, name = $4, category_id = $5, subcategory_id = $6,
				description = $7, item_type = $8, uses_serial = $9, total_quantity = $10,
				available_quantity = $11, rental_price = $12, status = $13, notes = $14, is_active = $15
			 WHERE company_id = $1 AND id = $2 RETURNING *`,
			[
				requireCompanyId(ctx), id, next.internal_code || null, next.name, next.category_id || null,
				next.subcategory_id || null, next.description || null, next.item_type || 'cantidad',
				next.uses_serial ? 1 : 0, next.total_quantity ?? 0, next.available_quantity ?? 0,
				next.rental_price ?? 0, next.status || 'disponible', next.notes || null, next.is_active ?? 1
			]
		);
		return result.rows[0];
	}

	async setState(ctx: RepositoryContext, id: ESRId, state: RecordState): Promise<void> {
		await this.pool.query(
			'UPDATE items SET is_active = $3 WHERE company_id = $1 AND id = $2',
			[requireCompanyId(ctx), id, state]
		);
	}

	async findAvailableByDateRange(ctx: RepositoryContext, input: AvailabilityInput = {}): Promise<InventoryAvailability[]> {
		const params: unknown[] = [requireCompanyId(ctx)];
		const where = ['i.company_id = $1', 'i.is_active = 1'];
		if (input.item_id) { params.push(input.item_id); where.push(`i.id = $${params.length}`); }
		const startParam = input.start_date ? (params.push(input.start_date), `$${params.length}`) : null;
		const endParam = input.end_date ? (params.push(input.end_date), `$${params.length}`) : null;
		const dateClauses = ["wo.company_id = $1"];
		if (startParam) dateClauses.push(`wo.date >= ${startParam}`);
		if (endParam) dateClauses.push(`wo.date <= ${endParam}`);
		const result = await this.pool.query<InventoryAvailability>(
			`SELECT i.id AS item_id, i.total_quantity, i.available_quantity,
				COALESCE(SUM(CASE WHEN wo.id IS NOT NULL THEN r.quantity ELSE 0 END), 0)::integer AS committed_quantity
			 FROM items i
			 LEFT JOIN work_order_stock_reservations r
				ON r.item_id = i.id AND r.company_id = i.company_id AND r.status = 'reserved'
			 LEFT JOIN work_orders wo ON wo.id = r.work_order_id AND ${dateClauses.join(' AND ')}
			 WHERE ${where.join(' AND ')}
			 GROUP BY i.id, i.total_quantity, i.available_quantity`, params
		);
		return result.rows;
	}

	async updateAvailableQuantity(ctx: RepositoryContext, id: ESRId, quantity: number): Promise<void> {
		await this.pool.query(
			'UPDATE items SET available_quantity = $3 WHERE company_id = $1 AND id = $2',
			[requireCompanyId(ctx), id, quantity]
		);
	}
}

