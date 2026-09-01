import type { PageServerLoad } from './$types';
import { recordAuditLog } from '$lib/server/audit';
import {
	getCustomerRepository,
	getEventRepository,
	getRentalRepository
} from '$lib/server/repositories';
import { requirePermission } from '$lib/server/permissions';
import { toTenantContext } from '$lib/server/tenant';

export const load: PageServerLoad = async (event) => {
	const { companyId } = requirePermission(event.locals, 'reports.view');
	const ctx = toTenantContext(companyId);
	const search = event.url.searchParams.get('search')?.trim() || undefined;
	const status = event.url.searchParams.get('status')?.trim() || undefined;
	const dateFrom = event.url.searchParams.get('dateFrom')?.trim() || undefined;
	const dateTo = event.url.searchParams.get('dateTo')?.trim() || undefined;

	// El rango va al REPOSITORIO, no a un `filter` en memoria sobre lo ya
	// traido. Aquel se aplicaba DESPUES del limite, asi que acotar las fechas
	// no traia mas filas: solo escondia parte de las que cabian. Y el listado
	// de ordenes usa ahora ese mismo filtro, que es lo que garantiza que el
	// reporte y la pantalla contesten lo mismo —las ordenes SIN fecha salen en
	// los dos, igual que salian aqui.
	const orders = await getRentalRepository().list(ctx, {
		search,
		status,
		date_from: dateFrom,
		date_to: dateTo,
		limit: 500,
		offset: 0
	});

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
