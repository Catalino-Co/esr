import type { PageServerLoad } from './$types';
import {
	getCustomerRepository,
	getEventRepository,
	getQuoteRepository
} from '$lib/server/repositories';
import { requirePermission } from '$lib/server/permissions';
import { toTenantContext } from '$lib/server/tenant';

export const load: PageServerLoad = async ({ locals, url }) => {
	const { companyId } = requirePermission(locals, 'quotes.view');
	const ctx = toTenantContext(companyId);
	const search = url.searchParams.get('search')?.trim() || undefined;
	const status = url.searchParams.get('status')?.trim() || undefined;

	const quotes = await getQuoteRepository().list(ctx, { search, status, limit: 100, offset: 0 });
	const customers = await getCustomerRepository().list(ctx, { limit: 500, offset: 0 });
	const events = await getEventRepository().list(ctx, { limit: 500, offset: 0 });

	const customerMap = new Map(customers.map((c) => [c.id, c.name]));
	const eventMap = new Map(events.map((e) => [e.id, e.name]));

	return {
		quotes: quotes.map((quote) => ({
			...quote,
			client_name: quote.client_id ? customerMap.get(quote.client_id) ?? '—' : '—',
			event_name: quote.event_id ? eventMap.get(quote.event_id) ?? '—' : '—'
		})),
		search: search ?? '',
		status: status ?? ''
	};
};
