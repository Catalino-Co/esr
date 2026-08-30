import { invalid, isPresent, valid, type ESRId, type Nullable, type ValidationResult } from './shared';

export type Customer = {
	id?: Nullable<ESRId>;
	company_id?: string;
	name: string;
	document_id?: string;
	phone?: string;
	email?: string;
	address?: string;
	contact_person?: string;
	notes?: string;
	/**
	 * Los tres campos comerciales son OPCIONALES a proposito.
	 *
	 * `TenantCreateCustomerInput` se deriva de este tipo, asi que uno
	 * obligatorio romperia la compilacion de Desktop y de todo el codigo que
	 * hoy crea clientes con solo el nombre. Y ademas serian falsos: los
	 * clientes que ya existen no tienen ninguno de los tres.
	 */
	document_type?: string | null;
	payment_terms?: string | null;
	sector_id?: number | string | null;
	is_active?: number;
};

export function validateCustomerInput(customer: Pick<Customer, 'name'>): ValidationResult {
	return isPresent(customer.name) ? valid() : invalid('customer.name.required');
}
