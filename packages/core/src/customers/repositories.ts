import type { Customer, ESRId } from '@esr/schemas';

export type CreateCustomerInput = Omit<Customer, 'id'>;

export interface CustomerRepository {
	findById(id: ESRId): Promise<Customer | null>;
	create(data: CreateCustomerInput): Promise<Customer>;
	update(id: ESRId, data: Partial<Customer>): Promise<Customer>;
}

