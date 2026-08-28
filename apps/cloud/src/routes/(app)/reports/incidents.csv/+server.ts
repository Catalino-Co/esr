import type { RequestHandler } from './$types';
import { toCsv } from '$lib/server/csv';
import { getIncidentRepository, getInventoryRepository, getRentalRepository } from '$lib/server/repositories';
import { requirePermission } from '$lib/server/permissions';
import { toTenantContext } from '$lib/server/tenant';

export const GET: RequestHandler = async ({ locals, url }) => {
	const { companyId } = requirePermission(locals, 'reports.view');
	const ctx = toTenantContext(companyId);
	const status = url.searchParams.get('status')?.trim() || undefined;
	const severity = url.searchParams.get('severity')?.trim() || undefined;
	const type = url.searchParams.get('type')?.trim() || undefined;
	const dateFrom = url.searchParams.get('dateFrom')?.trim() || undefined;
	const dateTo = url.searchParams.get('dateTo')?.trim() || undefined;

	let incidents = await getIncidentRepository().list(ctx, { limit: 5000, offset: 0 });
	if (status) incidents = incidents.filter((row) => row.status === status);
	if (severity) incidents = incidents.filter((row) => row.severity === severity);
	if (type) incidents = incidents.filter((row) => row.type === type);
	if (dateFrom) incidents = incidents.filter((row) => !row.date || row.date >= dateFrom);
	if (dateTo) incidents = incidents.filter((row) => !row.date || row.date <= dateTo);

	const [orders, inventory] = await Promise.all([
		getRentalRepository().list(ctx, { limit: 500, offset: 0 }),
		getInventoryRepository().list(ctx, { limit: 500, offset: 0 })
	]);
	const orderMap = new Map(orders.map((o) => [String(o.id), o.order_number || o.id]));
	const itemMap = new Map(inventory.map((i) => [String(i.id), i.name]));

	const rows = incidents.map((incident) => [
		incident.type ?? '',
		incident.severity ?? '',
		incident.status ?? '',
		incident.work_order_id ? orderMap.get(String(incident.work_order_id)) ?? '' : '',
		incident.item_id ? itemMap.get(String(incident.item_id)) ?? '' : '',
		(incident.description ?? '').slice(0, 120),
		Number(incident.estimated_cost || 0).toFixed(2),
		incident.date ?? incident.created_at?.slice(0, 10) ?? ''
	]);

	const csv = toCsv(
		['Tipo', 'Severidad', 'Estado', 'Orden', 'Articulo', 'Descripcion', 'CostoEst', 'Fecha'],
		rows
	);

	return new Response(csv, {
		headers: {
			'Content-Type': 'text/csv; charset=utf-8',
			'Content-Disposition': 'attachment; filename="incidencias.csv"'
		}
	});
};
