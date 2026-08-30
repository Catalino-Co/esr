import {
	calculateQuoteLineTotal,
	calculateQuoteTotals,
	type AddQuoteItemInput,
	type QuoteTotalsInput,
	type RepositoryContext,
	type TenantCreateQuoteInput,
	type TenantQuoteRepository
} from '@esr/core';
import { DEFAULT_RECORD_STATE, requireCompanyId, todayISO } from '@esr/core';
import type { ESRId, Quote, QuoteItem } from '@esr/schemas';
import type pg from 'pg';
import { getPostgresPool } from '../connection';
import { appendStateFilter } from './state-filter';
import { appendPagination } from './pagination';
import type { QuoteListFilters, RecordState } from '@esr/core';

const ACTIVE_RESERVATION_STATUSES = [
	'confirmado',
	'en_preparacion',
	'entregado',
	'parcialmente_devuelto',
	'pendiente',
	'preparado',
	'cargado'
];

type QuoteRow = Quote & { id: number };
type QuoteItemRow = QuoteItem & { id: number; quotation_id: number; item_id: number | null };

function mapQuoteItem(row: QuoteItemRow): QuoteItem {
	return {
		id: row.id,
		company_id: row.company_id,
		quotation_id: row.quotation_id,
		item_id: row.item_id,
		name: row.name,
		code: row.code,
		quantity: Number(row.quantity || 0),
		price: Number(row.price || 0),
		total: Number(row.total || 0),
		is_package: Boolean(row.package_id),
		// Sin estas dos, la conversion a orden y la comprobacion de
		// disponibilidad reciben siempre `undefined`, por mucho que la fila
		// las traiga: el INSERT las escribe y el mapeo las tiraba.
		start_date: row.start_date ?? null,
		end_date: row.end_date ?? null
	};
}

export class PostgresQuoteRepository implements TenantQuoteRepository {
	constructor(private readonly pool: pg.Pool = getPostgresPool()) {}

	private queryClient(client?: pg.PoolClient): Pick<pg.Pool, 'query'> {
		return client ?? this.pool;
	}

	async findById(ctx: RepositoryContext, id: ESRId, client?: pg.PoolClient): Promise<Quote | null> {
		const result = await this.queryClient(client).query<QuoteRow>(
			'SELECT * FROM quotations WHERE company_id = $1 AND id = $2',
			[requireCompanyId(ctx), id]
		);
		return result.rows[0] ?? null;
	}

	async list(ctx: RepositoryContext, filters: QuoteListFilters = {}): Promise<Quote[]> {
		const params: unknown[] = [requireCompanyId(ctx)];
		const where = ['q.company_id = $1'];
		if (filters.search) {
			params.push(`%${filters.search}%`);
			where.push(
				`(q.quote_number ILIKE $${params.length} OR c.name ILIKE $${params.length} OR e.name ILIKE $${params.length})`
			);
		}
		// Estado de circulacion. Esta consulta ignoraba `is_active` por completo,
		// asi que los desactivados seguian saliendo en la lista.
		appendStateFilter(params, where, filters.state, 'q.');
		if (filters.status) {
			params.push(filters.status);
			where.push(`q.status = $${params.length}`);
		}
		if (filters.event_id) {
			params.push(filters.event_id);
			where.push(`q.event_id = $${params.length}`);
		}
		const result = await this.pool.query<QuoteRow>(
			`SELECT q.* FROM quotations q
			 LEFT JOIN clients c ON c.id = q.client_id AND c.company_id = q.company_id
			 LEFT JOIN events e ON e.id = q.event_id AND e.company_id = q.company_id
			 WHERE ${where.join(' AND ')} ORDER BY q.created_at DESC, q.id DESC${appendPagination(params, filters)}`,
			params
		);
		return result.rows;
	}

	async findByEventId(ctx: RepositoryContext, eventId: ESRId): Promise<Quote[]> {
		return this.list(ctx, { event_id: eventId, limit: 100, offset: 0 });
	}

	async nextQuoteNumber(ctx: RepositoryContext, client?: pg.PoolClient): Promise<string> {
		const companyId = requireCompanyId(ctx);
		const result = await this.queryClient(client).query<{ quote_number: string | null }>(
			`SELECT quote_number FROM quotations
			 WHERE company_id = $1 AND quote_number IS NOT NULL
			 ORDER BY id DESC LIMIT 1`,
			[companyId]
		);
		const last = result.rows[0]?.quote_number;
		const next = last ? Number(last.replace(/\D/g, '')) + 1 : 1;
		return `COT-${String(next).padStart(6, '0')}`;
	}

	async create(ctx: RepositoryContext, data: TenantCreateQuoteInput, client?: pg.PoolClient): Promise<Quote> {
		const companyId = requireCompanyId(ctx);
		const db = this.queryClient(client);
		const quoteNumber = await this.nextQuoteNumber(ctx, client);
		const totals = calculateQuoteTotals(data.items || [], data.discount ?? 0, data.tax_amount ?? 0);
		const result = await db.query<QuoteRow>(
			`INSERT INTO quotations
				(company_id, client_id, event_id, quote_number, date, validity_days, valid_until,
				 subtotal, discount, tax_amount, total, status, notes, conditions, is_active)
			 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
			 RETURNING *`,
			[
				companyId,
				data.client_id,
				data.event_id || null,
				quoteNumber,
				data.date || todayISO(),
				data.validity_days ?? 15,
				data.valid_until || null,
				totals.subtotal,
				totals.discount,
				totals.tax_amount,
				totals.total,
				data.status || 'borrador',
				data.notes || null,
				data.conditions || null,
				data.is_active ?? 1
			]
		);
		const quote = result.rows[0];
		if (data.items?.length) await this.replaceItems(ctx, quote.id!, data.items, client);
		return quote;
	}

	async update(ctx: RepositoryContext, id: ESRId, data: Partial<TenantCreateQuoteInput>): Promise<Quote> {
		const current = await this.findById(ctx, id);
		if (!current) throw new Error(`Quote ${id} not found in company.`);
		const next = { ...current, ...data };
		const result = await this.pool.query<QuoteRow>(
			`UPDATE quotations SET
				client_id = $3, event_id = $4, date = $5, validity_days = $6, valid_until = $7,
				subtotal = $8, discount = $9, tax_amount = $10, total = $11, status = $12,
				notes = $13, conditions = $14
			 WHERE company_id = $1 AND id = $2 RETURNING *`,
			[
				requireCompanyId(ctx),
				id,
				next.client_id,
				next.event_id || null,
				next.date || null,
				next.validity_days ?? 15,
				next.valid_until || null,
				next.subtotal ?? 0,
				next.discount ?? 0,
				next.tax_amount ?? 0,
				next.total ?? 0,
				next.status || 'borrador',
				next.notes || null,
				next.conditions || null
			]
		);
		return result.rows[0];
	}

	async setState(ctx: RepositoryContext, id: ESRId, state: RecordState): Promise<void> {
		await this.pool.query(
			'UPDATE quotations SET is_active = $3 WHERE company_id = $1 AND id = $2',
			[requireCompanyId(ctx), id, state]
		);
	}

	async listItems(ctx: RepositoryContext, quoteId: ESRId, client?: pg.PoolClient): Promise<QuoteItem[]> {
		const result = await this.queryClient(client).query<QuoteItemRow>(
			`SELECT qi.*, i.name AS item_name, i.internal_code AS item_code
			 FROM quotation_items qi
			 LEFT JOIN items i ON i.id = qi.item_id AND i.company_id = qi.company_id
			 WHERE qi.company_id = $1 AND qi.quotation_id = $2
			 ORDER BY qi.id`,
			[requireCompanyId(ctx), quoteId]
		);
		return result.rows.map((row) => {
			const enriched = row as QuoteItemRow & { item_name?: string; item_code?: string };
			return mapQuoteItem({
				...enriched,
				name: enriched.name || enriched.item_name,
				code: enriched.code || enriched.item_code
			});
		});
	}

	async addItem(ctx: RepositoryContext, quoteId: ESRId, data: AddQuoteItemInput): Promise<QuoteItem> {
		const companyId = requireCompanyId(ctx);
		const quote = await this.findById(ctx, quoteId);
		if (!quote) throw new Error(`Quote ${quoteId} not found in company.`);

		const itemResult = await this.pool.query<{ id: number; name: string; internal_code: string | null }>(
			'SELECT id, name, internal_code FROM items WHERE company_id = $1 AND id = $2 AND is_active = 1',
			[companyId, data.item_id]
		);
		if (!itemResult.rows[0]) throw new Error('Inventory item not found in company.');

		const lineTotal = calculateQuoteLineTotal({ quantity: data.quantity, price: data.price });
		const insert = await this.pool.query<QuoteItemRow>(
			`INSERT INTO quotation_items
				(company_id, quotation_id, item_id, name, code, quantity, price, total, start_date, end_date)
			 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
			 RETURNING *`,
			[
				companyId,
				quoteId,
				data.item_id,
				itemResult.rows[0].name,
				itemResult.rows[0].internal_code,
				data.quantity,
				data.price,
				lineTotal,
				data.start_date || null,
				data.end_date || null
			]
		);
		await this.syncTotals(ctx, quoteId);
		return mapQuoteItem(insert.rows[0]);
	}

	async updateItem(
		ctx: RepositoryContext,
		quoteId: ESRId,
		itemId: ESRId,
		data: Partial<AddQuoteItemInput>
	): Promise<QuoteItem> {
		const companyId = requireCompanyId(ctx);
		const current = await this.pool.query<QuoteItemRow>(
			'SELECT * FROM quotation_items WHERE company_id = $1 AND quotation_id = $2 AND id = $3',
			[companyId, quoteId, itemId]
		);
		if (!current.rows[0]) throw new Error(`Quote item ${itemId} not found.`);

		const row = current.rows[0];
		const quantity = data.quantity ?? Number(row.quantity || 0);
		const price = data.price ?? Number(row.price || 0);
		const lineTotal = calculateQuoteLineTotal({ quantity, price });

		const updated = await this.pool.query<QuoteItemRow>(
			`UPDATE quotation_items SET quantity = $4, price = $5, total = $6, start_date = $7, end_date = $8
			 WHERE company_id = $1 AND quotation_id = $2 AND id = $3 RETURNING *`,
			[
				companyId,
				quoteId,
				itemId,
				quantity,
				price,
				lineTotal,
				data.start_date ?? row.start_date,
				data.end_date ?? row.end_date
			]
		);
		await this.syncTotals(ctx, quoteId);
		return mapQuoteItem(updated.rows[0]);
	}

	async removeItem(ctx: RepositoryContext, quoteId: ESRId, itemId: ESRId): Promise<void> {
		await this.pool.query(
			'DELETE FROM quotation_items WHERE company_id = $1 AND quotation_id = $2 AND id = $3',
			[requireCompanyId(ctx), quoteId, itemId]
		);
		await this.syncTotals(ctx, quoteId);
	}

	async syncTotals(ctx: RepositoryContext, quoteId: ESRId, client?: pg.PoolClient): Promise<Quote> {
		const quote = await this.findById(ctx, quoteId, client);
		if (!quote) throw new Error(`Quote ${quoteId} not found.`);
		const items = await this.listItems(ctx, quoteId, client);
		const totals = calculateQuoteTotals(items, quote.discount ?? 0, quote.tax_amount ?? 0);
		return this.updateTotals(ctx, quoteId, totals, client);
	}

	async updateTotals(ctx: RepositoryContext, quoteId: ESRId, totals: QuoteTotalsInput, client?: pg.PoolClient): Promise<Quote> {
		const result = await this.queryClient(client).query<QuoteRow>(
			`UPDATE quotations SET subtotal = $3, discount = $4, tax_amount = $5, total = $6
			 WHERE company_id = $1 AND id = $2 RETURNING *`,
			[requireCompanyId(ctx), quoteId, totals.subtotal, totals.discount, totals.tax_amount, totals.total]
		);
		if (!result.rows[0]) throw new Error(`Quote ${quoteId} not found in company.`);
		return result.rows[0];
	}

	async changeStatus(ctx: RepositoryContext, quoteId: ESRId, status: Quote['status'], client?: pg.PoolClient): Promise<Quote> {
		const db = this.queryClient(client);
		const confirmedAt = status === 'aprobada' ? new Date().toISOString() : null;
		const cancelledAt = status === 'cancelada' ? new Date().toISOString() : null;
		const result = await db.query<QuoteRow>(
			`UPDATE quotations SET status = $3,
				confirmed_at = COALESCE($4, confirmed_at),
				cancelled_at = COALESCE($5, cancelled_at)
			 WHERE company_id = $1 AND id = $2 RETURNING *`,
			[requireCompanyId(ctx), quoteId, status, confirmedAt, cancelledAt]
		);
		if (!result.rows[0]) throw new Error(`Quote ${quoteId} not found in company.`);
		return result.rows[0];
	}

	async replaceItems(ctx: RepositoryContext, quoteId: ESRId, items: QuoteItem[], client?: pg.PoolClient): Promise<void> {
		const companyId = requireCompanyId(ctx);
		const db = this.queryClient(client);
		await db.query('DELETE FROM quotation_items WHERE company_id = $1 AND quotation_id = $2', [companyId, quoteId]);
		for (const item of items) {
			if (item.is_package) continue;
			const lineTotal = item.total ?? calculateQuoteLineTotal(item);
			await db.query(
				`INSERT INTO quotation_items
					(company_id, quotation_id, item_id, package_id, name, code, quantity, price, total)
				 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
				[
					companyId,
					quoteId,
					item.item_id || item.id,
					item.package_id || null,
					item.name || null,
					item.code || null,
					item.quantity,
					item.price,
					lineTotal
				]
			);
		}
		await this.syncTotals(ctx, quoteId, client);
	}

	async getReservedQuantity(
		ctx: RepositoryContext,
		itemId: ESRId,
		startDate?: string,
		endDate?: string,
		client?: pg.PoolClient
	): Promise<number> {
		const params: unknown[] = [requireCompanyId(ctx), itemId, ACTIVE_RESERVATION_STATUSES];
		let dateClause = 'TRUE';
		if (startDate && endDate) {
			params.push(startDate, endDate);
			dateClause = `(COALESCE(woi.start_date, wo.date, '') <= $${params.length}
				AND COALESCE(woi.end_date, wo.date, '') >= $${params.length - 1})`;
		}
		const result = await this.queryClient(client).query<{ qty: string }>(
			`SELECT COALESCE(SUM(
				GREATEST(0, woi.quantity - COALESCE(woi.returned_quantity, 0))
			 ), 0)::text AS qty
			 FROM work_order_items woi
			 INNER JOIN work_orders wo ON wo.id = woi.work_order_id AND wo.company_id = woi.company_id
			 WHERE woi.company_id = $1 AND woi.item_id = $2
			   AND wo.status = ANY($3::text[]) AND wo.is_active = 1
			   AND woi.status NOT IN ('cancelado', 'devuelto')
			   AND ${dateClause}`,
			params
		);
		return Number(result.rows[0]?.qty || 0);
	}

	async checkAvailability(
		ctx: RepositoryContext,
		itemId: ESRId,
		quantity: number,
		startDate?: string,
		endDate?: string
	): Promise<{ ok: boolean; available: number }> {
		const companyId = requireCompanyId(ctx);
		const item = await this.pool.query<{ total_quantity: number }>(
			'SELECT total_quantity FROM items WHERE company_id = $1 AND id = $2',
			[companyId, itemId]
		);
		if (!item.rows[0]) return { ok: false, available: 0 };
		const reserved = await this.getReservedQuantity(ctx, itemId, startDate, endDate);
		const available = Number(item.rows[0].total_quantity || 0) - reserved;
		return { ok: available >= quantity, available };
	}
}

export { ACTIVE_RESERVATION_STATUSES };
