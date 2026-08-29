import type { Contract, ESRId } from '@esr/schemas';
import type { RepositoryContext } from '../shared/tenant';

export interface ContractRepository {
	findById(id: ESRId): Promise<Contract | null>;
	create(data: Omit<Contract, 'id'>): Promise<Contract>;
	update(id: ESRId, data: Partial<Contract>): Promise<Contract>;
}

export type ContractListFilters = {
	status?: string;
	search?: string;
	quotation_id?: ESRId;
	limit?: number;
	offset?: number;
};

/**
 * Un contrato formaliza una cotizacion aprobada. No guarda su propio total: el
 * monto acordado es el de la cotizacion enlazada, que es donde vive el dinero.
 * El contrato es opcional; convertir una cotizacion en orden no lo exige.
 */
export interface TenantContractRepository {
	findById(ctx: RepositoryContext, id: ESRId): Promise<Contract | null>;
	list(ctx: RepositoryContext, filters?: ContractListFilters): Promise<Contract[]>;
	/** El contrato vigente de una cotizacion, si ya se genero uno. */
	findByQuotationId(ctx: RepositoryContext, quotationId: ESRId): Promise<Contract | null>;
	create(ctx: RepositoryContext, data: Omit<Contract, 'id' | 'company_id'>): Promise<Contract>;
	update(ctx: RepositoryContext, id: ESRId, data: Partial<Omit<Contract, 'id' | 'company_id'>>): Promise<Contract>;
	changeStatus(ctx: RepositoryContext, id: ESRId, status: string): Promise<Contract>;
	deactivate(ctx: RepositoryContext, id: ESRId): Promise<void>;
	/** Siguiente numero de la empresa, con el formato CTR-000001. */
	nextNumber(ctx: RepositoryContext): Promise<string>;
}
