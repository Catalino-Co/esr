import { invalid, isPresent, valid, type ESRId, type Nullable, type ValidationResult } from './shared';

export type InventoryItemType = 'cantidad' | 'serializado' | string;

export type InventoryItem = {
	id?: Nullable<ESRId>;
	internal_code?: string;
	name: string;
	category_id: ESRId | '';
	subcategory_id?: Nullable<ESRId> | '';
	description?: string;
	item_type?: InventoryItemType;
	uses_serial?: number | boolean;
	total_quantity?: number;
	available_quantity?: number;
	rental_price?: number;
	status?: string;
	notes?: string;
	is_active?: number;
};

export function validateInventoryItemInput(item: Pick<InventoryItem, 'name' | 'category_id'>): ValidationResult {
	return isPresent(item.name) && isPresent(item.category_id) ? valid() : invalid('inventory_item.required_fields');
}
