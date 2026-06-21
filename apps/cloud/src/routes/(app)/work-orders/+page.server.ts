import type { PageServerLoad } from './$types';
import {
	getCustomerRepository,
	getEventRepository,
	getRentalRepository
} from '$lib/server/repositories';
import { requireCompany } from '$lib/server/require-auth';
import { toTenantContext } from '$lib/server/tenant';

export const load: PageServerLoad = async ({ locals, url }) => {
	const { companyId } = requireCompany(locals);
	const ctx = toTenantContext(companyId);
	const search = url.searchParams.get('search')?.trim() || undefined;
	const status = url.searchParams.get('status')?.trim() || undefined;

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
