import type { Contract, ESRId } from '@esr/schemas';
import type { RepositoryContext } from '../shared/tenant';

export interface ContractRepository {
	findById(id: ESRId): Promise<Contract | null>;
	create(data: Omit<Contract, 'id'>): Promise<Contract>;
	update(id: ESRId, data: Partial<Contract>): Promise<Contract>;
}

export interface TenantContractRepository {
	findById(ctx: RepositoryContext, id: ESRId): Promise<Contract | null>;
	list(ctx: RepositoryContext, filters?: { status?: string }): Promise<Contract[]>;
	create(ctx: RepositoryContext, data: Omit<Contract, 'id' | 'company_id'>): Promise<Contract>;
	update(ctx: RepositoryContext, id: ESRId, data: Partial<Omit<Contract, 'id' | 'company_id'>>): Promise<Contract>;
	deactivate(ctx: RepositoryContext, id: ESRId): Promise<void>;
}
