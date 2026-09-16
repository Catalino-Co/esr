import type { RequestHandler } from './$types';
import { toCsv } from '$lib/server/csv';
import { getCustomerRepository, getEventRepository } from '$lib/server/repositories';
import { requirePermission } from '$lib/server/permissions';
import { toTenantContext } from '$lib/server/tenant';

export const GET: RequestHandler = async ({ locals, url }) => {
	const { companyId } = requirePermission(locals, 'reports.view');
	const ctx = toTenantContext(companyId);
	const search = url.searchParams.get('search')?.trim() || undefined;
	const status = url.searchParams.get('status')?.trim() || undefined;
	const dateFrom = url.searchParams.get('dateFrom')?.trim() || undefined;
	const dateTo = url.searchParams.get('dateTo')?.trim() || undefined;

	const [events, customers] = await Promise.all([
		getEventRepository().list(ctx, {
			search,
			status,
			date_from: dateFrom,
			date_to: dateTo,
			limit: 5000,
			offset: 0
		}),
		getCustomerRepository().list(ctx, { limit: 500, offset: 0 })
	]);
	const customerMap = new Map(customers.map((c) => [String(c.id), c.name]));

	const rows = events.map((ev) => [
		ev.date ?? '',
		ev.name ?? '',
		ev.event_type ?? '',
		ev.client_id ? (customerMap.get(String(ev.client_id)) ?? '') : '',
		ev.location ?? '',
		ev.status ?? ''
	]);

	const csv = toCsv(['Fecha', 'Evento', 'Tipo', 'Cliente', 'Lugar', 'Estado'], rows);

	return new Response(csv, {
		headers: {
			'Content-Type': 'text/csv; charset=utf-8',
			'Content-Disposition': 'attachment; filename="eventos.csv"'
		}
	});
};
