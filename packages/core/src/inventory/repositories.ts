import type { ESRId, InventoryItem } from '@esr/schemas';
import type { RepositoryContext } from '../shared/tenant';

export type AvailabilityInput = {
	item_id?: ESRId;
	start_date?: string;
	end_date?: string;
};

export type InventoryAvailability = {
	item_id: ESRId;
	total_quantity: number;
	available_quantity: number;
	committed_quantity: number;
};

export type TenantCreateInventoryItemInput = Omit<InventoryItem, 'id' | 'company_id'>;
export type InventoryListFilters = { search?: string; status?: string; category_id?: ESRId; is_active?: number; limit?: number; offset?: number };

export interface InventoryRepository {
	findById(id: ESRId): Promise<InventoryItem | null>;
	findAvailableByDateRange(input: AvailabilityInput): Promise<InventoryAvailability[]>;
	updateAvailableQuantity(id: ESRId, quantity: number): Promise<void>;
}

export interface TenantInventoryRepository {
	findById(ctx: RepositoryContext, id: ESRId): Promise<InventoryItem | null>;
	list(ctx: RepositoryContext, filters?: InventoryListFilters): Promise<InventoryItem[]>;
	create(ctx: RepositoryContext, data: TenantCreateInventoryItemInput): Promise<InventoryItem>;
	update(ctx: RepositoryContext, id: ESRId, data: Partial<TenantCreateInventoryItemInput>): Promise<InventoryItem>;
	deactivate(ctx: RepositoryContext, id: ESRId): Promise<void>;
	findAvailableByDateRange(ctx: RepositoryContext, input: AvailabilityInput): Promise<InventoryAvailability[]>;
	updateAvailableQuantity(ctx: RepositoryContext, id: ESRId, quantity: number): Promise<void>;
}
