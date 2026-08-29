import type { ESRId, Nullable } from './shared';

export type ContractStatus = 'borrador' | 'firmado' | 'cancelado' | string;

export type Contract = {
	id?: Nullable<ESRId>;
	company_id?: string;
	customer_id?: ESRId;
	client_id?: ESRId;
	event_id?: Nullable<ESRId>;
	quote_id?: Nullable<ESRId>;
	quotation_id?: Nullable<ESRId>;
	// Nullable y no solo opcional: estas columnas admiten NULL en PostgreSQL.
	number?: Nullable<string>;
	date?: Nullable<string>;
	status?: ContractStatus;
	terms?: Nullable<string>;
	notes?: Nullable<string>;
	created_at?: string;
	updated_at?: Nullable<string>;
	is_active?: number;
};
