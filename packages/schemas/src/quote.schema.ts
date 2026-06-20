import { invalid, isPresent, valid, type ESRId, type Nullable, type ValidationResult } from './shared';

export type QuoteStatus = 'borrador' | 'enviada' | 'aprobada' | 'rechazada' | 'vencida' | string;

export type Quote = {
	id?: Nullable<ESRId>;
	company_id?: string;
	client_id: ESRId | '';
	event_id?: Nullable<ESRId>;
	date?: string;
	validity_days?: number;
	subtotal?: number;
	discount?: number;
	total?: number;
	status?: QuoteStatus;
	notes?: string;
	conditions?: string;
	is_active?: number;
};

export type QuoteItem = {
	id?: Nullable<ESRId>;
	company_id?: string;
	quote_id?: ESRId;
	quotation_id?: ESRId;
	item_id?: Nullable<ESRId>;
	package_id?: Nullable<ESRId>;
	name?: string;
	code?: string | null;
	quantity: number;
	price: number;
	total?: number;
	is_package?: boolean;
};

export function validateQuoteInput(quote: Pick<Quote, 'client_id'>): ValidationResult {
	return isPresent(quote.client_id) ? valid() : invalid('quote.client_id.required');
}
