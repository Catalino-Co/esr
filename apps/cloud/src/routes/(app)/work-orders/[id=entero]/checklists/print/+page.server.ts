import { error } from '@sveltejs/kit';
import { renderChecklistDocument } from '@esr/reports/documents';
import type { PageServerLoad } from './$types';
import { recordAuditLog } from '$lib/server/audit';
import {
	getChecklistRepository,
	getCompanyDocumentInfo,
	getCustomerRepository,
	getEventRepository,
	getRentalRepository
} from '$lib/server/repositories';
import { requirePermission } from '$lib/server/permissions';
import { toTenantContext } from '$lib/server/tenant';

export const load: PageServerLoad = async (event) => {
	const { companyId } = requirePermission(event.locals, 'work_orders.view');
	const ctx = toTenantContext(companyId);
	const type = event.url.searchParams.get('type') === 'retorno' ? 'retorno' : 'salida';

	const order = await getRentalRepository().findById(ctx, event.params.id);
	if (!order) error(404, 'Orden no encontrada');

	const [items, customer, eventRow, company] = await Promise.all([
		getChecklistRepository().findByWorkOrder(ctx, event.params.id, type),
		getCustomerRepository().findById(ctx, order.client_id),
		order.event_id ? getEventRepository().findById(ctx, order.event_id) : Promise.resolve(null),
		getCompanyDocumentInfo(ctx)
	]);

	await recordAuditLog(event, {
		action: 'document.printed',
		entity_type: 'checklist',
		entity_id: `${event.params.id}:${type}`,
		description: `Impresión checklist ${type} orden ${order.order_number || order.id}`
	});

	return {
		html: renderChecklistDocument({
			company,
			type,
			items,
			order,
			workOrderId: event.params.id,
			customer,
			event: eventRow
		}),
		backHref: `/work-orders/${event.params.id}/checklists`,
		title: `Checklist ${type}`
	};
};
