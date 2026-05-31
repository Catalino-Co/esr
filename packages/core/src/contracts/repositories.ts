import type { Contract, ESRId } from '@esr/schemas';

export interface ContractRepository {
	findById(id: ESRId): Promise<Contract | null>;
	create(data: Omit<Contract, 'id'>): Promise<Contract>;
	update(id: ESRId, data: Partial<Contract>): Promise<Contract>;
}
