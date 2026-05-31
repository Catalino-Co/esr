import { invalid, isPresent, valid, type ESRId, type Nullable, type ValidationResult } from './shared';

export type Customer = {
	id?: Nullable<ESRId>;
	name: string;
	document_id?: string;
	phone?: string;
	email?: string;
	address?: string;
	contact_person?: string;
	notes?: string;
	is_active?: number;
};

export function validateCustomerInput(customer: Pick<Customer, 'name'>): ValidationResult {
	return isPresent(customer.name) ? valid() : invalid('customer.name.required');
}
