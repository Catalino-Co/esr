import type { RepositoryContext } from '@esr/core';
import { round2, validateQuoteCanConvert } from '@esr/core';
import type { ESRId, Quote, RentalOrder } from '@esr/schemas';
import type pg from 'pg';
import { withTransaction } from '../transaction';
import { PostgresInventoryRepository } from '../repositories/postgres-inventory.repository';
import { PostgresInvoiceRepository } from '../repositories/postgres-invoice.repository';
import { PostgresQuoteRepository } from '../repositories/postgres-quote.repository';
import { PostgresRentalRepository } from '../repositories/postgres-rental.repository';

export class QuoteConversionService {
	constructor(
		private readonly quotes = new PostgresQuoteRepository(),
		private readonly orders = new PostgresRentalRepository(),
		private readonly inventory = new PostgresInventoryRepository(),
		private readonly invoices = new PostgresInvoiceRepository()
	) {}

	async convertToWorkOrder(ctx: RepositoryContext, quoteId: ESRId): Promise<{ quote: Quote; order: RentalOrder }> {
		return withTransaction(async (client) => {
			const quote = await this.quotes.findById(ctx, quoteId, client);
			if (!quote) throw new Error(`Quote ${quoteId} not found in company.`);

			const items = await this.quotes.listItems(ctx, quoteId, client);

			// Lo que ya se facturo DIRECTO desde esta cotizacion no viaja a la
			// orden: si viajara, esa cantidad podria entregarse, conducirse y
			// facturarse OTRA VEZ por el camino normal -doble cobro-. `total` se
			// anula a proposito: es el bruto de la cantidad ORIGINAL de la linea, y
			// dejarlo llevaria a la orden el importe de lo que ya se cobro.
			const facturado = await this.invoices.listBilledQuantitiesByQuotation(ctx, quoteId, client);
			const pendientes = items
				.map((item) => ({
					...item,
					quantity: round2(Number(item.quantity || 0) - (facturado.get(String(item.id)) ?? 0)),
					total: undefined
				}))
				.filter((item) => item.quantity > 0);

			if (items.length && !pendientes.length) {
				throw new Error('Todas las líneas de esta cotización ya se facturaron; no queda nada que convertir en orden.');
			}

			const validation = validateQuoteCanConvert(quote, pendientes);
			if (!validation.ok) throw new Error(validation.error || 'quote.cannot_convert');

			for (const item of pendientes) {
				if (!item.item_id) continue;
				const availability = await this.inventory.checkAvailability(
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

			const order = await this.orders.createFromQuote(ctx, quote, pendientes, client);
			const updatedQuote = await this.quotes.changeStatus(ctx, quoteId, 'convertida', client);
			return { quote: updatedQuote, order };
		});
	}
}
