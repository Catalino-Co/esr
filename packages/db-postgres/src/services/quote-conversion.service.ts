import type { RepositoryContext } from '@esr/core';
import { validateQuoteCanConvert } from '@esr/core';
import type { ESRId, Quote, RentalOrder } from '@esr/schemas';
import type pg from 'pg';
import { withTransaction } from '../transaction';
import { PostgresQuoteRepository } from '../repositories/postgres-quote.repository';
import { PostgresRentalRepository } from '../repositories/postgres-rental.repository';

export class QuoteConversionService {
	constructor(
		private readonly quotes = new PostgresQuoteRepository(),
		private readonly orders = new PostgresRentalRepository()
	) {}

	async convertToWorkOrder(ctx: RepositoryContext, quoteId: ESRId): Promise<{ quote: Quote; order: RentalOrder }> {
		return withTransaction(async (client) => {
			const quote = await this.quotes.findById(ctx, quoteId, client);
			if (!quote) throw new Error(`Quote ${quoteId} not found in company.`);

			const items = await this.quotes.listItems(ctx, quoteId, client);
			const validation = validateQuoteCanConvert(quote, items);
			if (!validation.ok) throw new Error(validation.error || 'quote.cannot_convert');

			for (const item of items) {
				if (!item.item_id) continue;
				const availability = await this.quotes.checkAvailability(
					ctx,
					item.item_id,
					Number(item.quantity || 0),
					item.start_date || undefined,
					item.end_date || undefined
				);
				if (!availability.ok) {
					throw new Error(
						`Insufficient availability for ${item.name}: need ${item.quantity}, available ${availability.available}.`
					);
				}
			}

			const order = await this.orders.createFromQuote(ctx, quote, items, client);
			const updatedQuote = await this.quotes.changeStatus(ctx, quoteId, 'convertida', client);
			return { quote: updatedQuote, order };
		});
	}
}
