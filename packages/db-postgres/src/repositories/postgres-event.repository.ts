import type { CreateEventInput, EventConflictInput, EventRepository } from '@esr/core';
import type { ESRId, Event } from '@esr/schemas';
import type pg from 'pg';
import { getPostgresPool } from '../connection';

export class PostgresEventRepository implements EventRepository {
	constructor(private readonly pool: pg.Pool = getPostgresPool()) {}

	async findById(id: ESRId): Promise<Event | null> {
		const result = await this.pool.query<Event>('SELECT * FROM events WHERE id = $1', [id]);
		return result.rows[0] ?? null;
	}

	async findConflictingByDate(input: EventConflictInput): Promise<Event[]> {
		const clauses = ['date = $1'];
		const params: unknown[] = [input.date];

		if (input.exclude_event_id) {
			params.push(input.exclude_event_id);
			clauses.push(`id != $${params.length}`);
		}

		if (input.client_id) {
			params.push(input.client_id);
			clauses.push(`client_id = $${params.length}`);
		}

		if (input.location) {
			params.push(input.location);
			clauses.push(`location = $${params.length}`);
		}

		const result = await this.pool.query<Event>(
			`SELECT * FROM events WHERE ${clauses.join(' AND ')}`,
			params
		);
		return result.rows;
	}

	async create(data: CreateEventInput): Promise<Event> {
		const result = await this.pool.query<Event>(
			`INSERT INTO events
				(client_id, name, event_type, date, departure_time, setup_time, pickup_date, pickup_time,
				 location, responsible_person, notes, quotation_id, work_order_id, status, is_active)
			 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
			 RETURNING *`,
			[
				data.client_id || null,
				data.name,
				data.event_type || null,
				data.date || null,
				data.departure_time || null,
				data.setup_time || null,
				data.pickup_date || null,
				data.pickup_time || null,
				data.location || null,
				data.responsible_person || null,
				data.notes || null,
				data.quotation_id || null,
				data.work_order_id || null,
				data.status || 'tentativo',
				data.is_active ?? 1
			]
		);

		return result.rows[0];
	}

	async update(id: ESRId, data: Partial<Event>): Promise<Event> {
		const current = await this.findById(id);
		if (!current) throw new Error(`Event ${id} not found.`);

		return this.createLikeUpdate(id, { ...current, ...data });
	}

	private async createLikeUpdate(id: ESRId, data: Event): Promise<Event> {
		const result = await this.pool.query<Event>(
			`UPDATE events SET
				client_id = $1,
				name = $2,
				event_type = $3,
				date = $4,
				departure_time = $5,
				setup_time = $6,
				pickup_date = $7,
				pickup_time = $8,
				location = $9,
				responsible_person = $10,
				notes = $11,
				quotation_id = $12,
				work_order_id = $13,
				status = $14,
				is_active = $15
			 WHERE id = $16
			 RETURNING *`,
			[
				data.client_id || null,
				data.name,
				data.event_type || null,
				data.date || null,
				data.departure_time || null,
				data.setup_time || null,
				data.pickup_date || null,
				data.pickup_time || null,
				data.location || null,
				data.responsible_person || null,
				data.notes || null,
				data.quotation_id || null,
				data.work_order_id || null,
				data.status || 'tentativo',
				data.is_active ?? 1,
				id
			]
		);

		return result.rows[0];
	}
}

