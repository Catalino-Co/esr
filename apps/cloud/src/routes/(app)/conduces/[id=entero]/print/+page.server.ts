import { error } from '@sveltejs/kit';
import { renderConduceDocument } from '@esr/reports/documents';
import type { PageServerLoad } from './$types';
import { recordAuditLog } from '$lib/server/audit';
import {
	getCompanyDocumentInfo,
	getConduceRepository,
	getCustomerRepository,
	getEventRepository,
	getRentalRepository
} from '$lib/server/repositories';
import { requirePermission } from '$lib/server/permissions';
import { toTenantContext } from '$lib/server/tenant';

export const load: PageServerLoad = async (event) => {
	const { companyId } = requirePermission(event.locals, 'conduces.view');
	const ctx = toTenantContext(companyId);

	const conduce = await getConduceRepository().findById(ctx, event.params.id);
	if (!conduce) error(404, 'Conduce no encontrado');

	const [items, order, company] = await Promise.all([
		getConduceRepository().listItems(ctx, event.params.id),
		getRentalRepository().findById(ctx, conduce.work_order_id),
		getCompanyDocumentInfo(ctx)
	]);

	const [customer, eventRow] = order
		? await Promise.all([
				getCustomerRepository().findById(ctx, order.client_id),
				order.event_id ? getEventRepository().findById(ctx, order.event_id) : Promise.resolve(null)
			])
		: [null, null];

	await recordAuditLog(event, {
		action: 'document.printed',
		entity_type: 'conduce',
		entity_id: String(conduce.id),
		description: `Impresión de conduce ${conduce.note_number || conduce.id}`,
		metadata: { noteNumber: conduce.note_number }
	});

	return {
		html: renderConduceDocument({ company, conduce, items, order, customer, event: eventRow }),
		backHref: `/conduces/${event.params.id}`,
		title: `Conduce ${conduce.note_number || conduce.id}`
	};
};
