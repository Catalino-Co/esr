import type { ESRId, RentalOrder, RentalOrderItem } from '@esr/schemas';
import type { RepositoryContext } from '../shared/tenant';

export type CreateRentalOrderInput = Omit<RentalOrder, 'id'> & { items: RentalOrderItem[] };
export type TenantCreateRentalOrderInput = Omit<CreateRentalOrderInput, 'company_id'>;
export type RentalOrderListFilters = { search?: string; status?: string; date?: string; limit?: number; offset?: number };

export interface RentalOrderRepository {
	findById(id: ESRId): Promise<RentalOrder | null>;
	create(data: CreateRentalOrderInput): Promise<RentalOrder>;
	update(id: ESRId, data: Partial<RentalOrder>): Promise<RentalOrder>;
	listItems(orderId: ESRId): Promise<RentalOrderItem[]>;
	replaceItems(orderId: ESRId, items: RentalOrderItem[]): Promise<void>;
}

export interface TenantRentalOrderRepository {
	findById(ctx: RepositoryContext, id: ESRId): Promise<RentalOrder | null>;
	list(ctx: RepositoryContext, filters?: RentalOrderListFilters): Promise<RentalOrder[]>;
	create(ctx: RepositoryContext, data: TenantCreateRentalOrderInput): Promise<RentalOrder>;
	update(ctx: RepositoryContext, id: ESRId, data: Partial<TenantCreateRentalOrderInput>): Promise<RentalOrder>;
	deactivate(ctx: RepositoryContext, id: ESRId): Promise<void>;
	listItems(ctx: RepositoryContext, orderId: ESRId): Promise<RentalOrderItem[]>;
	replaceItems(ctx: RepositoryContext, orderId: ESRId, items: RentalOrderItem[]): Promise<void>;
}
