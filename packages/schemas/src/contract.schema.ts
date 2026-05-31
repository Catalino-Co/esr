import type { ESRId, Nullable } from './shared';

export type ContractStatus = 'borrador' | 'firmado' | 'cancelado' | string;

export type Contract = {
	id?: Nullable<ESRId>;
	customer_id?: ESRId;
	client_id?: ESRId;
	event_id?: Nullable<ESRId>;
	quote_id?: Nullable<ESRId>;
	quotation_id?: Nullable<ESRId>;
	number?: string;
	date?: string;
	status?: ContractStatus;
	terms?: string;
	notes?: string;
};
