import type { ESRId } from '@esr/schemas';

export type ChecklistType = 'salida' | 'retorno';

export type ChecklistItem = {
	item_id: ESRId;
	item_name?: string;
	internal_code?: string;
	expected_quantity: number;
	actual_quantity: number;
	is_damaged?: boolean | number;
	is_missing?: boolean | number;
	notes?: string;
};

export interface ChecklistRepository {
	findByWorkOrder(workOrderId: ESRId, type: ChecklistType): Promise<ChecklistItem[]>;
	replaceForWorkOrder(workOrderId: ESRId, type: ChecklistType, items: ChecklistItem[]): Promise<void>;
}
