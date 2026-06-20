import type { ESRId, Nullable } from './shared';

export type PaymentStatus = 'pendiente' | 'pagado' | 'anulado' | string;

export type Payment = {
	id?: Nullable<ESRId>;
	company_id?: string;
	customer_id?: ESRId;
	client_id?: ESRId;
	quote_id?: Nullable<ESRId>;
	quotation_id?: Nullable<ESRId>;
	contract_id?: Nullable<ESRId>;
	date?: string;
	amount: number;
	method?: string;
	reference?: string;
	status?: PaymentStatus;
	notes?: string;
};
