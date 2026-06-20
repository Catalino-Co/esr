import type { ESRId } from '@esr/schemas';

export type IncidentType = 'daño' | 'faltante' | string;
export type IncidentSeverity = 'baja' | 'media' | 'alta' | string;
export type IncidentStatus = 'reportado' | 'en reparación' | 'resuelto' | 'cobrado' | 'pérdida total' | string;

export type IncidentDraft = {
	id?: ESRId | null;
	type: IncidentType;
	item_id: ESRId | '';
	client_id?: ESRId | null | '';
	work_order_id?: ESRId | null | '';
	date?: string;
	description?: string;
	severity?: IncidentSeverity;
	estimated_cost?: number;
	status?: IncidentStatus;
	notes?: string;
	is_active?: number;
};

export interface IncidentRepository {
	findById(id: ESRId): Promise<IncidentDraft | null>;
	create(data: IncidentDraft): Promise<IncidentDraft>;
	update(id: ESRId, data: IncidentDraft): Promise<IncidentDraft>;
	updateStatus(id: ESRId, status: IncidentStatus): Promise<void>;
}
