import { error } from '@sveltejs/kit';
import { renderIncidentDocument } from '@esr/reports/documents';
import type { PageServerLoad } from './$types';
import { recordAuditLog } from '$lib/server/audit';
import {
	getCompanyDocumentInfo,
	getIncidentRepository,
	getRentalRepository
} from '$lib/server/repositories';
import { requireCompany } from '$lib/server/require-auth';
import { toTenantContext } from '$lib/server/tenant';

export const load: PageServerLoad = async (event) => {
	const { companyId } = requireCompany(event.locals);
	const ctx = toTenantContext(companyId);

	const incident = await getIncidentRepository().findById(ctx, event.params.id);
	if (!incident) error(404, 'Incidencia no encontrada');

	const [company, order] = await Promise.all([
		getCompanyDocumentInfo(ctx),
		incident.work_order_id
			? getRentalRepository().findById(ctx, incident.work_order_id)
			: Promise.resolve(null)
	]);

	await recordAuditLog(event, {
		action: 'document.printed',
		entity_type: 'incident',
		entity_id: String(incident.id),
		description: `Impresión incidencia #${incident.id}`
	});

	return {
		html: renderIncidentDocument({ company, incident, order }),
		backHref: incident.work_order_id ? `/work-orders/${incident.work_order_id}/incidents` : '/incidents',
		title: `Incidencia #${incident.id}`
	};
};
