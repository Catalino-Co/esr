import { invalid, isPresent, valid, type ESRId, type Nullable, type ValidationResult } from './shared';

export type RentalOrderStatus =
	| 'pendiente'
	| 'preparado'
	| 'cargado'
	| 'entregado'
	| 'en recogida'
	| 'retornado'
	| 'cerrado'
	| string;

export type RentalOrder = {
	id?: Nullable<ESRId>;
	company_id?: string;
	client_id: ESRId | '';
	event_id?: Nullable<ESRId>;
	quotation_id?: Nullable<ESRId>;
	date?: string;
	responsible_person?: string;
	vehicle?: string;
	notes?: string;
	status?: RentalOrderStatus;
};

export type RentalOrderItem = {
	id?: Nullable<ESRId>;
	company_id?: string;
	rental_order_id?: ESRId;
	work_order_id?: ESRId;
	item_id: ESRId;
	name?: string;
	internal_code?: string;
	quantity: number;
};

export function validateRentalOrderInput(order: Pick<RentalOrder, 'client_id'>): ValidationResult {
	return isPresent(order.client_id) ? valid() : invalid('rental_order.client_id.required');
}
