import { invalid, isPresent, valid, type ESRId, type Nullable, type ValidationResult } from './shared';

export type EventStatus = 'tentativo' | 'confirmado' | 'completado' | 'cancelado' | string;

export type Event = {
	id?: Nullable<ESRId>;
	company_id?: string;
	client_id: ESRId | '';
	name: string;
	event_type?: string;
	date?: string;
	departure_time?: string;
	setup_time?: string;
	pickup_date?: string;
	pickup_time?: string;
	location?: string;
	responsible_person?: string;
	notes?: string;
	quotation_id?: Nullable<ESRId> | '';
	work_order_id?: Nullable<ESRId> | '';
	status?: EventStatus;
	is_active?: number;
};

export function validateEventInput(event: Pick<Event, 'name' | 'client_id'>): ValidationResult {
	return isPresent(event.name) && isPresent(event.client_id) ? valid() : invalid('event.required_fields');
}
