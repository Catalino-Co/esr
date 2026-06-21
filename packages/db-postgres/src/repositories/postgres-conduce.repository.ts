import type { RepositoryContext } from '@esr/core';
import { requireCompanyId } from '@esr/core';
import type { Conduce, ConduceItem, ESRId } from '@esr/schemas';
import type pg from 'pg';
import { getPostgresPool } from '../connection';
import { appendPagination } from './pagination';

export type ConduceListFilters = { work_order_id?: ESRId; conduce_type?: string; limit?: number; offset?: number };

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
		const where = ['company_id = $1', 'is_active = 1'];
		if (filters.work_order_id) {
			params.push(filters.work_order_id);
			where.push(`work_order_id = $${params.length}`);
		}
		if (filters.conduce_type) {
			params.push(filters.conduce_type);
			where.push(`conduce_type = $${params.length}`);
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

	async create(
		ctx: RepositoryContext,
		data: {
			work_order_id: ESRId;
			client_id?: ESRId | null;
			conduce_type: string;
			notes?: string;
			items: Array<{ work_order_item_id: ESRId; item_id: ESRId; quantity: number; price?: number }>;
		},
		client?: pg.PoolClient
	): Promise<Conduce> {
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
		for (const line of data.items) {
			await this.db(client).query(
				`INSERT INTO conduce_items
					(company_id, conduce_id, work_order_item_id, item_id, quantity, price, status)
				 VALUES ($1, $2, $3, $4, $5, $6, 'pending')`,
				[companyId, conduce.id, line.work_order_item_id, line.item_id, line.quantity, line.price || 0]
			);
		}
		return conduce;
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
