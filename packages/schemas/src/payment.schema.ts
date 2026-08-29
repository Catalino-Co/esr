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
	// Nullable y no solo opcional: estas columnas admiten NULL en PostgreSQL.
	date?: Nullable<string>;
	/** Llega como string desde PostgreSQL: NUMERIC no cabe en un number sin perder precision. */
	amount: number | string;
	method?: Nullable<string>;
	reference?: Nullable<string>;
	status?: PaymentStatus;
	notes?: Nullable<string>;
	created_at?: string;
	updated_at?: Nullable<string>;
};
