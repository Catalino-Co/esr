import type { RequestHandler } from './$types';
import { toCsv } from '$lib/server/csv';
import {
	getCustomerRepository,
	getEventRepository,
	getRentalRepository
} from '$lib/server/repositories';
import { requirePermission } from '$lib/server/permissions';
import { toTenantContext } from '$lib/server/tenant';

export const GET: RequestHandler = async ({ locals, url }) => {
	const { companyId } = requirePermission(locals, 'reports.view');
	const ctx = toTenantContext(companyId);
	const search = url.searchParams.get('search')?.trim() || undefined;
	const status = url.searchParams.get('status')?.trim() || undefined;
	const dateFrom = url.searchParams.get('dateFrom')?.trim() || undefined;
	const dateTo = url.searchParams.get('dateTo')?.trim() || undefined;

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
		limit: 5000,
		offset: 0
	});

	const [customers, events] = await Promise.all([
		getCustomerRepository().list(ctx, { limit: 500, offset: 0 }),
		getEventRepository().list(ctx, { limit: 500, offset: 0 })
	]);
	const customerMap = new Map(customers.map((c) => [String(c.id), c.name]));
	const eventMap = new Map(events.map((e) => [String(e.id), e.name]));

	const rows = orders.map((order) => [
		order.order_number ?? order.id,
		order.client_id ? customerMap.get(String(order.client_id)) ?? '' : '',
		order.event_id ? eventMap.get(String(order.event_id)) ?? '' : '',
		order.status ?? '',
		order.date ?? '',
		Number(order.total || 0).toFixed(2)
	]);

	const csv = toCsv(['Numero', 'Cliente', 'Evento', 'Estado', 'Fecha', 'Total'], rows);

	return new Response(csv, {
		headers: {
			'Content-Type': 'text/csv; charset=utf-8',
			'Content-Disposition': 'attachment; filename="ordenes.csv"'
		}
	});
};
