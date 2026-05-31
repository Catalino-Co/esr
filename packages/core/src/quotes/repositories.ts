import type { ESRId, Quote, QuoteItem } from '@esr/schemas';

export type CreateQuoteInput = Omit<Quote, 'id'> & {
	items: QuoteItem[];
};

export interface QuoteRepository {
	findById(id: ESRId): Promise<Quote | null>;
	create(data: CreateQuoteInput): Promise<Quote>;
	update(id: ESRId, data: Partial<Quote>): Promise<Quote>;
	replaceItems(quoteId: ESRId, items: QuoteItem[]): Promise<void>;
}
