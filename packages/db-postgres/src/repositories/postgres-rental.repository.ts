import type { CreateRentalOrderInput, RentalOrderRepository } from '@esr/core';
import type { ESRId, RentalOrder, RentalOrderItem } from '@esr/schemas';
import type pg from 'pg';
import { getPostgresPool } from '../connection';

export class PostgresRentalRepository implements RentalOrderRepository {
	constructor(private readonly pool: pg.Pool = getPostgresPool()) {}

	async findById(id: ESRId): Promise<RentalOrder | null> {
		const result = await this.pool.query<RentalOrder>('SELECT * FROM work_orders WHERE id = $1', [id]);
		return result.rows[0] ?? null;
	}

	async create(data: CreateRentalOrderInput): Promise<RentalOrder> {
		const result = await this.pool.query<RentalOrder>(
			`INSERT INTO work_orders
				(client_id, event_id, quotation_id, date, responsible_person, vehicle, notes, status)
			 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
			 RETURNING *`,
			[
				data.client_id || null,
				data.event_id || null,
				data.quotation_id || null,
				data.date || null,
				data.responsible_person || null,
				data.vehicle || null,
				data.notes || null,
				data.status || 'pendiente'
			]
		);

		await this.replaceItems(result.rows[0].id as ESRId, data.items || []);
		return result.rows[0];
	}

	async update(id: ESRId, data: Partial<RentalOrder>): Promise<RentalOrder> {
		const current = await this.findById(id);
		if (!current) throw new Error(`Rental order ${id} not found.`);
		const next = { ...current, ...data };

		const result = await this.pool.query<RentalOrder>(
			`UPDATE work_orders SET
				client_id = $1,
				event_id = $2,
				quotation_id = $3,
				date = $4,
				responsible_person = $5,
				vehicle = $6,
				notes = $7,
				status = $8
			 WHERE id = $9
			 RETURNING *`,
			[
				next.client_id || null,
				next.event_id || null,
				next.quotation_id || null,
				next.date || null,
				next.responsible_person || null,
				next.vehicle || null,
				next.notes || null,
				next.status || 'pendiente',
				id
			]
		);

		return result.rows[0];
	}

	async listItems(orderId: ESRId): Promise<RentalOrderItem[]> {
		const result = await this.pool.query<RentalOrderItem>(
			`SELECT
				woi.id,
				woi.work_order_id,
				woi.item_id,
				i.name,
				i.internal_code,
				woi.quantity
			 FROM work_order_items woi
			 LEFT JOIN items i ON i.id = woi.item_id
			 WHERE woi.work_order_id = $1`,
			[orderId]
		);

		return result.rows;
	}

	async replaceItems(orderId: ESRId, items: RentalOrderItem[]): Promise<void> {
		const client = await this.pool.connect();
		try {
			await client.query('BEGIN');
			await client.query('DELETE FROM work_order_items WHERE work_order_id = $1', [orderId]);

			for (const item of items) {
				await client.query(
					`INSERT INTO work_order_items (work_order_id, item_id, quantity)
					 VALUES ($1, $2, $3)`,
					[orderId, item.item_id, item.quantity]
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

