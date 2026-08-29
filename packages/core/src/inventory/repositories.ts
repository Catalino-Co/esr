import type { RecordState, RecordStateFilter } from '../shared/record-state';
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
export type InventoryListFilters = {
	/** Estado de circulacion; por defecto, solo activos. */
	state?: RecordStateFilter; search?: string; status?: string; category_id?: ESRId; limit?: number; offset?: number };

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
	/**
	 * Cambia el estado de circulacion. Sustituye al antiguo `deactivate()`, que
	 * fijaba 0 a pelo y no tenia inverso: con tres estados hace falta poder
	 * mover el registro en las dos direcciones.
	 */
	setState(ctx: RepositoryContext, id: ESRId, state: RecordState): Promise<void>;
	findAvailableByDateRange(ctx: RepositoryContext, input: AvailabilityInput): Promise<InventoryAvailability[]>;
	updateAvailableQuantity(ctx: RepositoryContext, id: ESRId, quantity: number): Promise<void>;
}
