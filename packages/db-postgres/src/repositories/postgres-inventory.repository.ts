import type { AvailabilityInput, InventoryAvailability, InventoryListFilters, RecordState, RepositoryContext, TenantCreateInventoryItemInput, TenantInventoryRepository } from '@esr/core';
import { DEFAULT_RECORD_STATE, requireCompanyId } from '@esr/core';
import type { ESRId, InventoryItem } from '@esr/schemas';
import type pg from 'pg';
import { getPostgresPool } from '../connection';
import { appendStateFilter } from './state-filter';
import { appendPagination } from './pagination';
import { availabilityColumnsSql, AVAILABILITY_ORDER_STATUSES } from './availability';

export class PostgresInventoryRepository implements TenantInventoryRepository {
	constructor(private readonly pool: pg.Pool = getPostgresPool()) {}

	async findById(ctx: RepositoryContext, id: ESRId): Promise<InventoryItem | null> {
		const result = await this.pool.query<InventoryItem>(
			`SELECT i.*, ${availabilityColumnsSql(3)}
			 FROM items i WHERE i.company_id = $1 AND i.id = $2`,
			[requireCompanyId(ctx), id, AVAILABILITY_ORDER_STATUSES]
		);
		return result.rows[0] ?? null;
	}

	async list(ctx: RepositoryContext, filters: InventoryListFilters = {}): Promise<InventoryItem[]> {
		const params: unknown[] = [requireCompanyId(ctx)];
		const where = ['i.company_id = $1'];
		if (filters.search) {
			params.push(`%${filters.search}%`);
			where.push(`(i.name ILIKE $${params.length} OR i.internal_code ILIKE $${params.length})`);
		}
		if (filters.status) { params.push(filters.status); where.push(`i.status = $${params.length}`); }
		if (filters.category_id) { params.push(filters.category_id); where.push(`i.category_id = $${params.length}`); }
		// Sin estado explicito se listan solo los activos.
		appendStateFilter(params, where, filters.state, 'i.');
		// La disponibilidad viaja con cada articulo, calculada. Antes el listado
		// pintaba `items.available_quantity`, una columna que solo cambiaba si
		// alguien abria la ficha y la reescribia a mano.
		params.push(AVAILABILITY_ORDER_STATUSES);
		const result = await this.pool.query<InventoryItem>(
			`SELECT i.*, ${availabilityColumnsSql(params.length)}
			 FROM items i WHERE ${where.join(' AND ')}
			 ORDER BY i.name${appendPagination(params, filters)}`,
			params
		);
		return result.rows;
	}

	async create(ctx: RepositoryContext, data: TenantCreateInventoryItemInput): Promise<InventoryItem> {
		const result = await this.pool.query<InventoryItem>(
			`INSERT INTO items
				(company_id, internal_code, name, category_id, subcategory_id, description, item_type,
				 uses_serial, total_quantity, rental_price, status, notes, is_active)
			 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
			 RETURNING *`,
			[
				requireCompanyId(ctx), data.internal_code || null, data.name, data.category_id || null,
				data.subcategory_id || null, data.description || null, data.item_type || 'cantidad',
				data.uses_serial ? 1 : 0, data.total_quantity ?? 0,
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
				rental_price = $11, status = $12, notes = $13, is_active = $14
			 WHERE company_id = $1 AND id = $2 RETURNING *`,
			[
				requireCompanyId(ctx), id, next.internal_code || null, next.name, next.category_id || null,
				next.subcategory_id || null, next.description || null, next.item_type || 'cantidad',
				next.uses_serial ? 1 : 0, next.total_quantity ?? 0,
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

	/**
	 * Disponibilidad de uno o de todos los articulos, opcionalmente acotada a
	 * una ventana de fechas.
	 *
	 * Sustituye a la version que sumaba `work_order_stock_reservations`, una
	 * tabla que solo se soltaba al cancelar la orden y que por eso llego a decir
	 * que habia 7 unidades comprometidas de un articulo del que existen 5.
	 */
	async findAvailableByDateRange(ctx: RepositoryContext, input: AvailabilityInput = {}): Promise<InventoryAvailability[]> {
		const params: unknown[] = [requireCompanyId(ctx)];
		const where = ['i.company_id = $1', 'i.is_active = 1'];
		if (input.item_id) {
			params.push(input.item_id);
			where.push(`i.id = $${params.length}`);
		}
		params.push(AVAILABILITY_ORDER_STATUSES);
		const statusParam = params.length;

		let startParam: number | undefined;
		let endParam: number | undefined;
		if (input.start_date && input.end_date) {
			params.push(input.start_date);
			startParam = params.length;
			params.push(input.end_date);
			endParam = params.length;
		}

		const result = await this.pool.query<InventoryAvailability>(
			`SELECT i.id AS item_id, ${availabilityColumnsSql(statusParam, startParam, endParam)}
			 FROM items i WHERE ${where.join(' AND ')}
			 ORDER BY i.name`,
			params
		);
		return result.rows;
	}

	/**
	 * Lo que queda libre de un articulo en una ventana, y si alcanza para lo
	 * pedido. Vivia en el repositorio de COTIZACIONES, que es donde nadie la
	 * buscaria: es una regla de inventario y la usan tanto la conversion de una
	 * cotizacion como la creacion directa de una orden.
	 */
	async checkAvailability(
		ctx: RepositoryContext,
		itemId: ESRId,
		quantity: number,
		startDate?: string,
		endDate?: string
	): Promise<{ ok: boolean; available: number }> {
		const filas = await this.findAvailableByDateRange(ctx, {
			item_id: itemId,
			start_date: startDate,
			end_date: endDate
		});
		const fila = filas[0];
		if (!fila) return { ok: false, available: 0 };
		const available = Number(fila.available_quantity || 0);
		return { ok: available >= quantity, available };
	}

}

