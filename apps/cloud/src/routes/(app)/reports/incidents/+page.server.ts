import type { PageServerLoad } from './$types';
import { recordAuditLog } from '$lib/server/audit';
import { getIncidentRepository, getInventoryRepository, getRentalRepository } from '$lib/server/repositories';
import { requireCompany } from '$lib/server/require-auth';
import { toTenantContext } from '$lib/server/tenant';

export const load: PageServerLoad = async (event) => {
	const { companyId } = requireCompany(event.locals);
	const ctx = toTenantContext(companyId);
	const status = event.url.searchParams.get('status')?.trim() || undefined;
	const severity = event.url.searchParams.get('severity')?.trim() || undefined;
	const type = event.url.searchParams.get('type')?.trim() || undefined;
	const dateFrom = event.url.searchParams.get('dateFrom')?.trim() || undefined;
	const dateTo = event.url.searchParams.get('dateTo')?.trim() || undefined;

	let incidents = await getIncidentRepository().list(ctx, { limit: 500, offset: 0 });
	if (status) incidents = incidents.filter((row) => row.status === status);
	if (severity) incidents = incidents.filter((row) => row.severity === severity);
	if (type) incidents = incidents.filter((row) => row.type === type);
	if (dateFrom) incidents = incidents.filter((row) => !row.date || row.date >= dateFrom);
	if (dateTo) incidents = incidents.filter((row) => !row.date || row.date <= dateTo);

	const [orders, inventory] = await Promise.all([
		getRentalRepository().list(ctx, { limit: 500, offset: 0 }),
		getInventoryRepository().list(ctx, { limit: 500, offset: 0 })
	]);
	const orderMap = new Map(orders.map((o) => [String(o.id), o.order_number || `#${o.id}`]));
	const itemMap = new Map(inventory.map((i) => [String(i.id), i.name]));

	await recordAuditLog(event, {
		action: 'report.viewed',
		entity_type: 'report',
		entity_id: 'incidents',
		description: 'Consulta reporte de incidencias'
	});

	return {
		incidents: incidents.map((incident) => ({
			...incident,
			order_label: incident.work_order_id ? orderMap.get(String(incident.work_order_id)) ?? '—' : '—',
			item_name: incident.item_id ? itemMap.get(String(incident.item_id)) ?? '—' : '—',
			short_description: (incident.description ?? '').slice(0, 80)
		})),
		status: status ?? '',
		severity: severity ?? '',
		type: type ?? '',
		dateFrom: dateFrom ?? '',
		dateTo: dateTo ?? ''
	};
};
