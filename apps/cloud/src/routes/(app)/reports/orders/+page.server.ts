import type { PageServerLoad } from './$types';
import { recordAuditLog } from '$lib/server/audit';
import {
	getCustomerRepository,
	getEventRepository,
	getRentalRepository
} from '$lib/server/repositories';
import { requireCompany } from '$lib/server/require-auth';
import { toTenantContext } from '$lib/server/tenant';

export const load: PageServerLoad = async (event) => {
	const { companyId } = requireCompany(event.locals);
	const ctx = toTenantContext(companyId);
	const search = event.url.searchParams.get('search')?.trim() || undefined;
	const status = event.url.searchParams.get('status')?.trim() || undefined;
	const dateFrom = event.url.searchParams.get('dateFrom')?.trim() || undefined;
	const dateTo = event.url.searchParams.get('dateTo')?.trim() || undefined;

	let orders = await getRentalRepository().list(ctx, { search, status, limit: 500, offset: 0 });
	if (dateFrom) orders = orders.filter((order) => !order.date || order.date >= dateFrom);
	if (dateTo) orders = orders.filter((order) => !order.date || order.date <= dateTo);

	const [customers, events] = await Promise.all([
		getCustomerRepository().list(ctx, { limit: 500, offset: 0 }),
		getEventRepository().list(ctx, { limit: 500, offset: 0 })
	]);
	const customerMap = new Map(customers.map((c) => [String(c.id), c.name]));
	const eventMap = new Map(events.map((e) => [String(e.id), e.name]));

	await recordAuditLog(event, {
		action: 'report.viewed',
		entity_type: 'report',
		entity_id: 'orders',
		description: 'Consulta reporte de órdenes'
	});

	return {
		orders: orders.map((order) => ({
			...order,
			client_name: order.client_id ? customerMap.get(String(order.client_id)) ?? '—' : '—',
			event_name: order.event_id ? eventMap.get(String(order.event_id)) ?? '—' : '—'
		})),
		search: search ?? '',
		status: status ?? '',
		dateFrom: dateFrom ?? '',
		dateTo: dateTo ?? ''
	};
};
