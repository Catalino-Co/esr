import { invalid, isPresent, valid, type ESRId, type Nullable, type ValidationResult } from './shared';

export type ConduceType = 'entrega' | 'devolucion' | string;
export type ConduceStatus = 'emitido' | 'completado' | 'anulado' | 'entregado' | string;

export type Conduce = {
	id?: Nullable<ESRId>;
	company_id?: string;
	work_order_id: ESRId | '';
	client_id?: Nullable<ESRId>;
	note_number?: string;
	conduce_type?: ConduceType;
	date?: string;
	status?: ConduceStatus;
	driver_or_vehicle?: string;
	received_by_name?: string;
	received_by_document?: string;
	notes?: string;
	subtotal?: number;
	discount?: number;
	total?: number;
	is_active?: number;
	created_at?: string;
	completed_at?: string;
};

export type ConduceItem = {
	id?: Nullable<ESRId>;
	company_id?: string;
	conduce_id?: ESRId;
	work_order_item_id?: Nullable<ESRId>;
	item_id: ESRId;
	name?: string;
	internal_code?: string;
	quantity: number;
	price?: number;
	status?: string;
	notes?: string;
};

export function validateCreateConduceInput(input: {
	work_order_id?: unknown;
	conduce_type?: unknown;
}): ValidationResult {
	if (!isPresent(input.work_order_id)) return invalid('conduce.work_order_id.required');
	if (!isPresent(input.conduce_type)) return invalid('conduce.type.required');
	return valid();
}
