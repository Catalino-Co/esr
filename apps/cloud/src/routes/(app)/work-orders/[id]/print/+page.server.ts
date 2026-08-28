import { error } from '@sveltejs/kit';
import { renderOrderDocument } from '@esr/reports/documents';
import type { PageServerLoad } from './$types';
import { recordAuditLog } from '$lib/server/audit';
import {
	getCompanyDocumentInfo,
	getCustomerRepository,
	getEventRepository,
	getRentalRepository
} from '$lib/server/repositories';
import { requireCompany } from '$lib/server/require-auth';
import { toTenantContext } from '$lib/server/tenant';

export const load: PageServerLoad = async (event) => {
	const { companyId } = requireCompany(event.locals);
	const ctx = toTenantContext(companyId);

	const order = await getRentalRepository().findById(ctx, event.params.id);
	if (!order) error(404, 'Orden no encontrada');

	const [items, customer, eventRow, company] = await Promise.all([
		getRentalRepository().listItems(ctx, event.params.id),
		getCustomerRepository().findById(ctx, order.client_id),
		order.event_id ? getEventRepository().findById(ctx, order.event_id) : Promise.resolve(null),
		getCompanyDocumentInfo(ctx)
	]);

	await recordAuditLog(event, {
		action: 'document.printed',
		entity_type: 'order',
		entity_id: String(order.id),
		description: `Impresión de orden ${order.order_number || order.id}`,
		metadata: { orderNumber: order.order_number }
	});

	return {
		html: renderOrderDocument({ company, order, customer, event: eventRow, items }),
		backHref: `/work-orders/${event.params.id}`,
		title: `Orden ${order.order_number || order.id}`
	};
};
