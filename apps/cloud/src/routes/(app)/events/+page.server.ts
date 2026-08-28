import type { PageServerLoad } from './$types';
import { getCustomerRepository, getEventRepository } from '$lib/server/repositories';
import { requirePermission } from '$lib/server/permissions';
import { toTenantContext } from '$lib/server/tenant';

export const load: PageServerLoad = async ({ locals, url }) => {
	const { companyId } = requirePermission(locals, 'events.view');
	const ctx = toTenantContext(companyId);
	const search = url.searchParams.get('search')?.trim() || undefined;
	const status = url.searchParams.get('status')?.trim() || undefined;

	const [events, customers] = await Promise.all([
		getEventRepository().list(ctx, { search, status, limit: 100, offset: 0 }),
		getCustomerRepository().list(ctx, { is_active: 1, limit: 500, offset: 0 })
	]);

	const customerMap = new Map(customers.map((customer) => [customer.id, customer.name]));

	return {
		events: events.map((event) => ({
			...event,
			client_name: event.client_id ? customerMap.get(event.client_id) ?? '—' : '—'
		})),
		search: search ?? '',
		status: status ?? ''
	};
};
