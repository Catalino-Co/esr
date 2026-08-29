import type { EventConflictInput, EventListFilters, RecordState, RepositoryContext, TenantCreateEventInput, TenantEventRepository } from '@esr/core';
import { DEFAULT_RECORD_STATE, requireCompanyId } from '@esr/core';
import type { ESRId, Event } from '@esr/schemas';
import type pg from 'pg';
import { getPostgresPool } from '../connection';
import { appendStateFilter } from './state-filter';
import { appendPagination } from './pagination';

export class PostgresEventRepository implements TenantEventRepository {
	constructor(private readonly pool: pg.Pool = getPostgresPool()) {}

	async findById(ctx: RepositoryContext, id: ESRId): Promise<Event | null> {
		const result = await this.pool.query<Event>(
			'SELECT * FROM events WHERE company_id = $1 AND id = $2',
			[requireCompanyId(ctx), id]
		);
		return result.rows[0] ?? null;
	}

	async list(ctx: RepositoryContext, filters: EventListFilters = {}): Promise<Event[]> {
		const params: unknown[] = [requireCompanyId(ctx)];
		const where = ['company_id = $1'];
		if (filters.search) {
			params.push(`%${filters.search}%`);
			where.push(`(name ILIKE $${params.length} OR location ILIKE $${params.length})`);
		}
		// Estado de circulacion. Esta consulta ignoraba `is_active` por completo,
		// asi que los desactivados seguian saliendo en la lista.
		appendStateFilter(params, where, filters.state);
		if (filters.status) {
			params.push(filters.status);
			where.push(`status = $${params.length}`);
		}
		if (filters.date) {
			params.push(filters.date);
			where.push(`date = $${params.length}`);
		}
		const result = await this.pool.query<Event>(
			`SELECT * FROM events WHERE ${where.join(' AND ')} ORDER BY date DESC, id DESC${appendPagination(params, filters)}`, params
		);
		return result.rows;
	}

	async findConflictingByDate(ctx: RepositoryContext, input: EventConflictInput): Promise<Event[]> {
		const params: unknown[] = [requireCompanyId(ctx), input.date];
		const clauses = ['company_id = $1', 'date = $2'];
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
			`SELECT * FROM events WHERE ${clauses.join(' AND ')}`, params
		);
		return result.rows;
	}

	async create(ctx: RepositoryContext, data: TenantCreateEventInput): Promise<Event> {
		const result = await this.pool.query<Event>(
			`INSERT INTO events
				(company_id, client_id, name, event_type, date, departure_time, setup_time, pickup_date,
				 pickup_time, location, responsible_person, notes, quotation_id, work_order_id, status, is_active)
			 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
			 RETURNING *`,
			[
				requireCompanyId(ctx), data.client_id || null, data.name, data.event_type || null,
				data.date || null, data.departure_time || null, data.setup_time || null,
				data.pickup_date || null, data.pickup_time || null, data.location || null,
				data.responsible_person || null, data.notes || null, data.quotation_id || null,
				data.work_order_id || null, data.status || 'tentativo', data.is_active ?? 1
			]
		);
		return result.rows[0];
	}

	async update(ctx: RepositoryContext, id: ESRId, data: Partial<TenantCreateEventInput>): Promise<Event> {
		const current = await this.findById(ctx, id);
		if (!current) throw new Error(`Event ${id} not found in company.`);
		const next = { ...current, ...data };
		const result = await this.pool.query<Event>(
			`UPDATE events SET client_id = $3, name = $4, event_type = $5, date = $6,
				departure_time = $7, setup_time = $8, pickup_date = $9, pickup_time = $10,
				location = $11, responsible_person = $12, notes = $13, quotation_id = $14,
				work_order_id = $15, status = $16, is_active = $17
			 WHERE company_id = $1 AND id = $2 RETURNING *`,
			[
				requireCompanyId(ctx), id, next.client_id || null, next.name, next.event_type || null,
				next.date || null, next.departure_time || null, next.setup_time || null,
				next.pickup_date || null, next.pickup_time || null, next.location || null,
				next.responsible_person || null, next.notes || null, next.quotation_id || null,
				next.work_order_id || null, next.status || 'tentativo', next.is_active ?? 1
			]
		);
		return result.rows[0];
	}

	async setState(ctx: RepositoryContext, id: ESRId, state: RecordState): Promise<void> {
		await this.pool.query(
			'UPDATE events SET is_active = $3 WHERE company_id = $1 AND id = $2',
			[requireCompanyId(ctx), id, state]
		);
	}

	async cancel(ctx: RepositoryContext, id: ESRId): Promise<Event> {
		const current = await this.findById(ctx, id);
		if (!current) throw new Error(`Event ${id} not found in company.`);
		const result = await this.pool.query<Event>(
			`UPDATE events SET status = 'cancelado'
			 WHERE company_id = $1 AND id = $2
			 RETURNING *`,
			[requireCompanyId(ctx), id]
		);
		return result.rows[0];
	}
}

