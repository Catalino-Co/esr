import { RECORD_STATE } from '@esr/core';
import type { PageServerLoad } from './$types';
import {
	getCustomerRepository,
	getEventRepository,
	getIncidentRepository,
	getInventoryRepository,
	getQuoteRepository,
	getRentalRepository
} from '$lib/server/repositories';
import { requirePermission } from '$lib/server/permissions';
import { toTenantContext } from '$lib/server/tenant';

const ACTIVE_ORDER_STATUSES = new Set(['confirmado', 'en_preparacion', 'entregado', 'parcialmente_devuelto', 'devuelto']);
const OPEN_QUOTE_STATUSES = new Set(['borrador', 'aprobada']);
const OPEN_INCIDENT_STATUSES = new Set(['reportado', 'abierto', 'open']);

export const load: PageServerLoad = async ({ parent, locals }) => {
	const parentData = await parent();
	const { companyId } = requirePermission(locals, 'customers.view');
	const ctx = toTenantContext(companyId);
	const today = new Date().toISOString().slice(0, 10);

	const [customers, inventory, events, quotes, orders, incidents] = await Promise.all([
		getCustomerRepository().list(ctx, { limit: 500, offset: 0 }),
		getInventoryRepository().list(ctx, { state: RECORD_STATE.ACTIVE, limit: 500, offset: 0 }),
		getEventRepository().list(ctx, { limit: 500, offset: 0 }),
		getQuoteRepository().list(ctx, { limit: 20, offset: 0 }),
		getRentalRepository().list(ctx, { limit: 20, offset: 0 }),
		getIncidentRepository().list(ctx, { limit: 500, offset: 0 })
	]);

	const upcomingEvents = events
		.filter((event) => event.date && String(event.date) >= today)
		.sort((a, b) => String(a.date).localeCompare(String(b.date)))
		.slice(0, 5);

	const recentQuotes = quotes.slice(0, 5);
	const activeOrders = orders
		.filter((order) => order.status && ACTIVE_ORDER_STATUSES.has(String(order.status)))
		.slice(0, 5);

	return {
		...parentData,
		stats: {
			customers: customers.length,
			inventory: inventory.length,
			events: events.length,
			openQuotes: quotes.filter((q) => q.status && OPEN_QUOTE_STATUSES.has(String(q.status))).length,
			activeOrders: orders.filter((o) => o.status && ACTIVE_ORDER_STATUSES.has(String(o.status))).length,
			openIncidents: incidents.filter(
				(i) => i.status && OPEN_INCIDENT_STATUSES.has(String(i.status))
			).length
		},
		upcomingEvents,
		recentQuotes,
		activeOrders
	};
};
