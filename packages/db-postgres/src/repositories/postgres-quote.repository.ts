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

/** Codigo de PostgreSQL para violacion de indice unico. */
const UNIQUE_VIOLATION = '23505';

/** Reintentos al chocar dos emisiones por el mismo numero. */
const QUOTE_NUMBER_RETRIES = 5;

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
		// `is_package` sale de `package_id`, pero el propio `package_id` no se
		// devolvia. Al releer una linea y volver a escribirla —copiar, por
		// ejemplo— llegaba marcada como paquete y sin el paquete al que apunta.
		package_id: row.package_id ?? null,
		// Las tasas de la linea, en PORCENTAJE. Sin ellas la pantalla y
		// `calculateQuoteTotals` verian 0 en todas partes y el impuesto
		// desapareceria del documento sin ningun error por el camino.
		discount_rate: Number(row.discount_rate || 0),
		tax_rate: Number(row.tax_rate || 0),
		discount_amount: Number(row.discount_amount || 0),
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

	/**
	 * Siguiente numero libre.
	 *
	 * Lee el maximo y suma uno, que es una carrera. Desde la migracion 014 el
	 * indice unico `quotations_company_quote_number_unique` la convierte en un
	 * error (23505) en vez de en dos cotizaciones con el mismo numero; quien
	 * llama reintenta. Antes se persistian las dos en silencio.
	 */
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
		// Sin los dos importes de cabecera: ahora salen de las tasas de cada
		// linea. `data.discount`/`data.tax_amount` se ignoran a proposito.
		const totals = calculateQuoteTotals(data.items || []);

		const insertar = async (quoteNumber: string) =>
			db.query<QuoteRow>(
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

		let quote: QuoteRow | undefined;
		for (let intento = 0; intento < QUOTE_NUMBER_RETRIES; intento += 1) {
			const quoteNumber = await this.nextQuoteNumber(ctx, client);
			if (!client) {
				// Fuera de transaccion no hay nada que salvar: se reintenta a secas.
				try {
					quote = (await insertar(quoteNumber)).rows[0];
					break;
				} catch (error) {
					if ((error as { code?: string }).code !== UNIQUE_VIOLATION) throw error;
					continue;
				}
			}
			// Dentro de una transaccion el 23505 la aborta entera, y el reintento
			// fallaria con «current transaction is aborted». El SAVEPOINT lo acota.
			try {
				await client.query('SAVEPOINT crear_cotizacion');
				quote = (await insertar(quoteNumber)).rows[0];
				await client.query('RELEASE SAVEPOINT crear_cotizacion');
				break;
			} catch (error) {
				await client.query('ROLLBACK TO SAVEPOINT crear_cotizacion');
				if ((error as { code?: string }).code !== UNIQUE_VIOLATION) throw error;
			}
		}
		if (!quote) throw new Error('No se pudo asignar un número de cotización libre. Vuelva a intentarlo.');

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
				(company_id, quotation_id, item_id, name, code, quantity, price, total,
				 discount_rate, tax_rate, start_date, end_date)
			 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
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
				data.discount_rate ?? 0,
				data.tax_rate ?? 0,
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
		// `??` y no `||`: poner una tasa a 0 —quitar el ITBIS de una linea— es
		// una operacion legitima, y con `||` se quedaria con la anterior.
		const discountRate = data.discount_rate ?? Number(row.discount_rate || 0);
		const taxRate = data.tax_rate ?? Number(row.tax_rate || 0);

		const updated = await this.pool.query<QuoteItemRow>(
			`UPDATE quotation_items
				SET quantity = $4, price = $5, total = $6, discount_rate = $7, tax_rate = $8,
				    start_date = $9, end_date = $10
			 WHERE company_id = $1 AND quotation_id = $2 AND id = $3 RETURNING *`,
			[
				companyId,
				quoteId,
				itemId,
				quantity,
				price,
				lineTotal,
				discountRate,
				taxRate,
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
		// Ya no se releen `quote.discount` ni `quote.tax_amount` para volver a
		// escribirlos: eran dato de entrada y ahora son RESULTADO. Todo sale de
		// las tasas de las lineas.
		const totals = calculateQuoteTotals(items);
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

	/**
	 * Reescribe las lineas de una cotizacion.
	 *
	 * Tres cosas que hacia mal y que solo se notaban al COPIAR, porque es el
	 * unico camino que lee lineas existentes y las vuelve a escribir:
	 *
	 *   * No propagaba `start_date` ni `end_date`. La ventana de alquiler es con
	 *     la que se comprueba disponibilidad y se reserva stock al convertir en
	 *     orden, asi que la copia salia sin ella y reservaba para siempre.
	 *   * Descartaba las lineas de paquete (`if (item.is_package) continue`), asi
	 *     que la copia perdia articulos sin decirlo.
	 *   * `item.item_id || item.id` caia al id de la FILA cuando no habia
	 *     articulo —una linea de paquete—, escribiendo como `item_id` algo que
	 *     no es un articulo.
	 */
	async replaceItems(ctx: RepositoryContext, quoteId: ESRId, items: QuoteItem[], client?: pg.PoolClient): Promise<void> {
		const companyId = requireCompanyId(ctx);
		const db = this.queryClient(client);
		await db.query('DELETE FROM quotation_items WHERE company_id = $1 AND quotation_id = $2', [companyId, quoteId]);
		for (const item of items) {
			const lineTotal = item.total ?? calculateQuoteLineTotal(item);
			await db.query(
				`INSERT INTO quotation_items
					(company_id, quotation_id, item_id, package_id, name, code,
					 quantity, price, total, discount_rate, tax_rate, discount_amount,
					 start_date, end_date)
				 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
				[
					companyId,
					quoteId,
					item.item_id ?? null,
					item.package_id ?? null,
					item.name || null,
					item.code || null,
					item.quantity,
					item.price,
					lineTotal,
					// Copiar una cotizacion tiene que copiar tambien lo que se
					// negocio en cada linea; si no, la copia sale sin impuesto.
					item.discount_rate ?? 0,
					item.tax_rate ?? 0,
					item.discount_amount ?? 0,
					item.start_date || null,
					item.end_date || null
				]
			);
		}
		await this.syncTotals(ctx, quoteId, client);
	}

}
