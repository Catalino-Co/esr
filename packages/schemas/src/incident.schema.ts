import { invalid, isPresent, valid, type ESRId, type Nullable, type ValidationResult } from './shared';

export type IncidentType = 'daño' | 'faltante' | 'nota' | 'otro' | string;
export type IncidentSeverity = 'baja' | 'media' | 'alta' | 'critica' | string;
export type IncidentStatus = 'reportado' | 'resuelto' | 'anulado' | string;

export type Incident = {
	id?: Nullable<ESRId>;
	company_id?: string;
	type: IncidentType;
	item_id?: Nullable<ESRId>;
	client_id?: Nullable<ESRId>;
	event_id?: Nullable<ESRId>;
	work_order_id?: Nullable<ESRId>;
	date?: string;
	description?: string;
	severity?: IncidentSeverity;
	estimated_cost?: number;
	status?: IncidentStatus;
	notes?: string;
	is_active?: number;
	created_at?: string;
};

export function validateCreateIncidentInput(input: {
	work_order_id?: unknown;
	type?: unknown;
	description?: unknown;
	estimated_cost?: unknown;
}): ValidationResult {
	if (!isPresent(input.work_order_id)) return invalid('incident.work_order_id.required');
	if (!isPresent(input.type)) return invalid('incident.type.required');
	if (!isPresent(input.description)) return invalid('incident.description.required');
	const cost = input.estimated_cost != null && input.estimated_cost !== '' ? Number(input.estimated_cost) : 0;
	if (Number.isNaN(cost) || cost < 0) return invalid('incident.cost.invalid');
	return valid();
}
