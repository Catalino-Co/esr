import type { ESRId, Quote, QuoteItem } from '@esr/schemas';
import type { RepositoryContext } from '../shared/tenant';

export type CreateQuoteInput = Omit<Quote, 'id'> & { items: QuoteItem[] };
export type TenantCreateQuoteInput = Omit<CreateQuoteInput, 'company_id'>;
export type QuoteListFilters = { search?: string; status?: string; event_id?: ESRId; created_from?: string; limit?: number; offset?: number };

export type AddQuoteItemInput = {
	item_id: ESRId;
	quantity: number;
	price: number;
	start_date?: string;
	end_date?: string;
};

export type QuoteTotalsInput = {
	subtotal: number;
	discount: number;
	tax_amount: number;
	total: number;
};

export interface QuoteRepository {
	findById(id: ESRId): Promise<Quote | null>;
	create(data: CreateQuoteInput): Promise<Quote>;
	update(id: ESRId, data: Partial<Quote>): Promise<Quote>;
	replaceItems(quoteId: ESRId, items: QuoteItem[]): Promise<void>;
}

export interface TenantQuoteRepository {
	findById(ctx: RepositoryContext, id: ESRId): Promise<Quote | null>;
	list(ctx: RepositoryContext, filters?: QuoteListFilters): Promise<Quote[]>;
	findByEventId(ctx: RepositoryContext, eventId: ESRId): Promise<Quote[]>;
	create(ctx: RepositoryContext, data: TenantCreateQuoteInput): Promise<Quote>;
	update(ctx: RepositoryContext, id: ESRId, data: Partial<TenantCreateQuoteInput>): Promise<Quote>;
	deactivate(ctx: RepositoryContext, id: ESRId): Promise<void>;
	listItems(ctx: RepositoryContext, quoteId: ESRId): Promise<QuoteItem[]>;
	addItem(ctx: RepositoryContext, quoteId: ESRId, data: AddQuoteItemInput): Promise<QuoteItem>;
	updateItem(ctx: RepositoryContext, quoteId: ESRId, itemId: ESRId, data: Partial<AddQuoteItemInput>): Promise<QuoteItem>;
	removeItem(ctx: RepositoryContext, quoteId: ESRId, itemId: ESRId): Promise<void>;
	updateTotals(ctx: RepositoryContext, quoteId: ESRId, totals: QuoteTotalsInput): Promise<Quote>;
	changeStatus(ctx: RepositoryContext, quoteId: ESRId, status: Quote['status']): Promise<Quote>;
	replaceItems(ctx: RepositoryContext, quoteId: ESRId, items: QuoteItem[]): Promise<void>;
}
