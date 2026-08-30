import type { ESRId, Nullable } from './shared';

export type PaymentStatus = 'pendiente' | 'pagado' | 'anulado' | string;

export type Payment = {
	id?: Nullable<ESRId>;
	company_id?: string;
	client_id?: ESRId;
	/** El pago cuelga de UNA factura: es el documento de dinero. */
	invoice_id: ESRId;
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
