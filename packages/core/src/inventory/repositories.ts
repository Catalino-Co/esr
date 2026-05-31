import type { ESRId, InventoryItem } from '@esr/schemas';

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

export interface InventoryRepository {
	findById(id: ESRId): Promise<InventoryItem | null>;
	findAvailableByDateRange(input: AvailabilityInput): Promise<InventoryAvailability[]>;
	updateAvailableQuantity(id: ESRId, quantity: number): Promise<void>;
}
