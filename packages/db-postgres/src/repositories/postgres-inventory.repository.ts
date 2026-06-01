import type { AvailabilityInput, InventoryAvailability, InventoryRepository } from '@esr/core';
import type { ESRId, InventoryItem } from '@esr/schemas';
import type pg from 'pg';
import { getPostgresPool } from '../connection';

export class PostgresInventoryRepository implements InventoryRepository {
	constructor(private readonly pool: pg.Pool = getPostgresPool()) {}

	async findById(id: ESRId): Promise<InventoryItem | null> {
		const result = await this.pool.query<InventoryItem>('SELECT * FROM items WHERE id = $1', [id]);
		return result.rows[0] ?? null;
	}

	async findAvailableByDateRange(input: AvailabilityInput = {}): Promise<InventoryAvailability[]> {
		const params: unknown[] = [];
		const where = ['i.is_active = 1'];

		if (input.item_id) {
			params.push(input.item_id);
			where.push(`i.id = $${params.length}`);
		}

		const result = await this.pool.query<InventoryAvailability>(
			`SELECT
				i.id as item_id,
				i.total_quantity,
				i.available_quantity,
				COALESCE(SUM(r.quantity), 0)::integer as committed_quantity
			 FROM items i
			 LEFT JOIN work_order_stock_reservations r
				ON r.item_id = i.id AND r.status = 'reserved'
			 WHERE ${where.join(' AND ')}
			 GROUP BY i.id, i.total_quantity, i.available_quantity`,
			params
		);

		return result.rows;
	}

	async updateAvailableQuantity(id: ESRId, quantity: number): Promise<void> {
		await this.pool.query('UPDATE items SET available_quantity = $1 WHERE id = $2', [quantity, id]);
	}
}

