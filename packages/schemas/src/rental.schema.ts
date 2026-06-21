import { invalid, isPresent, valid, type ESRId, type Nullable, type ValidationResult } from './shared';

export type RentalOrderStatus =
	| 'pendiente'
	| 'confirmado'
	| 'preparado'
	| 'cargado'
	| 'entregado'
	| 'en recogida'
	| 'retornado'
	| 'cerrado'
	| 'cancelado'
	| string;

export type RentalOrder = {
	id?: Nullable<ESRId>;
	company_id?: string;
	client_id: ESRId | '';
	event_id?: Nullable<ESRId>;
	quotation_id?: Nullable<ESRId>;
	order_number?: string;
	date?: string;
	responsible_person?: string;
	vehicle?: string;
	notes?: string;
	subtotal?: number;
	discount?: number;
	tax_amount?: number;
	total?: number;
	status?: RentalOrderStatus;
	is_active?: number;
	created_at?: string;
	confirmed_at?: string;
	closed_at?: string;
	cancelled_at?: string;
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
	delivered_quantity?: number;
	returned_quantity?: number;
	price?: number;
	line_total?: number;
	start_date?: string;
	end_date?: string;
	status?: string;
};

export function validateRentalOrderInput(order: Pick<RentalOrder, 'client_id'>): ValidationResult {
	return isPresent(order.client_id) ? valid() : invalid('rental_order.client_id.required');
}
