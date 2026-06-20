import type { Customer, ESRId } from '@esr/schemas';
import type { RepositoryContext } from '../shared/tenant';

export type CreateCustomerInput = Omit<Customer, 'id'>;
export type TenantCreateCustomerInput = Omit<CreateCustomerInput, 'company_id'>;
export type CustomerListFilters = { search?: string; is_active?: number; limit?: number; offset?: number };

/** Desktop-compatible repository contract. */
export interface CustomerRepository {
	findById(id: ESRId): Promise<Customer | null>;
	create(data: CreateCustomerInput): Promise<Customer>;
	update(id: ESRId, data: Partial<Customer>): Promise<Customer>;
}

/** ESR Cloud contract: every operation requires an explicit company context. */
export interface TenantCustomerRepository {
	findById(ctx: RepositoryContext, id: ESRId): Promise<Customer | null>;
	list(ctx: RepositoryContext, filters?: CustomerListFilters): Promise<Customer[]>;
	create(ctx: RepositoryContext, data: TenantCreateCustomerInput): Promise<Customer>;
	update(ctx: RepositoryContext, id: ESRId, data: Partial<TenantCreateCustomerInput>): Promise<Customer>;
	deactivate(ctx: RepositoryContext, id: ESRId): Promise<void>;
}

