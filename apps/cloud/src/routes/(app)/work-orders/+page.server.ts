import type { PageServerLoad } from './$types';
import {
	getCustomerRepository,
	getEventRepository,
	getRentalRepository
} from '$lib/server/repositories';
import { requirePermission } from '$lib/server/permissions';
import { toTenantContext } from '$lib/server/tenant';

export const load: PageServerLoad = async ({ locals, url }) => {
	const { companyId } = requirePermission(locals, 'work_orders.view');
	const ctx = toTenantContext(companyId);
	const search = url.searchParams.get('search')?.trim() || undefined;
	const status = url.searchParams.get('status')?.trim() || undefined;

	// Sin `state`: el listado ya no ofrece el eje de circulacion, y sin el
	// `appendStateFilter` del repositorio cae en `DEFAULT_RECORD_STATE`, que es
	// «activas». Una orden se retira CANCELANDOLA, que es su estado de negocio.
	// La columna sigue en la tabla y la usan los reportes.
	const orders = await getRentalRepository().list(ctx, { search, status, limit: 100, offset: 0 });
	const customers = await getCustomerRepository().list(ctx, { limit: 500, offset: 0 });
	const events = await getEventRepository().list(ctx, { limit: 500, offset: 0 });

	const customerMap = new Map(customers.map((c) => [c.id, c.name]));
	const eventMap = new Map(events.map((e) => [e.id, e.name]));

	return {
		orders: orders.map((order) => ({
			...order,
			client_name: order.client_id ? customerMap.get(order.client_id) ?? '—' : '—',
			event_name: order.event_id ? eventMap.get(order.event_id) ?? '—' : '—'
		})),
		search: search ?? '',
		status: status ?? ''
	};
};
