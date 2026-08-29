import type { Customer, ESRId } from '@esr/schemas';
import type { RecordState, RecordStateFilter } from '../shared/record-state';
import type { RepositoryContext } from '../shared/tenant';

export type CreateCustomerInput = Omit<Customer, 'id'>;
export type TenantCreateCustomerInput = Omit<CreateCustomerInput, 'company_id'>;
export type CustomerListFilters = {
	/** Estado de circulacion; por defecto, solo activos. */
	state?: RecordStateFilter; search?: string; limit?: number; offset?: number };

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
	/**
	 * Cambia el estado de circulacion. Sustituye al antiguo `deactivate()`, que
	 * fijaba 0 a pelo y no tenia inverso: con tres estados hace falta poder
	 * mover el registro en las dos direcciones.
	 */
	setState(ctx: RepositoryContext, id: ESRId, state: RecordState): Promise<void>;
}

