import type { ESRId, Quote, QuoteItem } from '@esr/schemas';
import type { RepositoryContext } from '../shared/tenant';

export type CreateQuoteInput = Omit<Quote, 'id'> & { items: QuoteItem[] };
export type TenantCreateQuoteInput = Omit<CreateQuoteInput, 'company_id'>;
export type QuoteListFilters = { search?: string; status?: string; created_from?: string };

export interface QuoteRepository {
	findById(id: ESRId): Promise<Quote | null>;
	create(data: CreateQuoteInput): Promise<Quote>;
	update(id: ESRId, data: Partial<Quote>): Promise<Quote>;
	replaceItems(quoteId: ESRId, items: QuoteItem[]): Promise<void>;
}

export interface TenantQuoteRepository {
	findById(ctx: RepositoryContext, id: ESRId): Promise<Quote | null>;
	list(ctx: RepositoryContext, filters?: QuoteListFilters): Promise<Quote[]>;
	create(ctx: RepositoryContext, data: TenantCreateQuoteInput): Promise<Quote>;
	update(ctx: RepositoryContext, id: ESRId, data: Partial<TenantCreateQuoteInput>): Promise<Quote>;
	deactivate(ctx: RepositoryContext, id: ESRId): Promise<void>;
	replaceItems(ctx: RepositoryContext, quoteId: ESRId, items: QuoteItem[]): Promise<void>;
}
