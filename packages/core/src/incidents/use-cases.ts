import { fail, ok, type UseCaseResult } from '../shared/result';
import type { IncidentDraft } from './repositories';

export function validateIncidentDraft(input: Pick<IncidentDraft, 'item_id'>): UseCaseResult<Pick<IncidentDraft, 'item_id'>> {
	return input.item_id ? ok(input) : fail('incident.item_id.required');
}

export function getIncidentStatusBadgeKind(status?: string): 'success' | 'secondary' | 'warning' | 'danger' | 'primary' {
	switch (status) {
		case 'resuelto':
		case 'cobrado':
			return 'success';
		case 'reportado':
			return 'secondary';
		case 'en reparación':
			return 'warning';
		case 'pérdida total':
			return 'danger';
		default:
			return 'primary';
	}
}

export function getIncidentSeverityTone(severity?: string): 'danger' | 'warning' | 'info' {
	if (severity === 'alta') return 'danger';
	if (severity === 'media') return 'warning';
	return 'info';
}
