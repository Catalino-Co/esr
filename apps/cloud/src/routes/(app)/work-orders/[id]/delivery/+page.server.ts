import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { getDeliverableQuantity } from '@esr/core';
import {
	getCustomerRepository,
	getEventRepository,
	getRentalRepository,
	getWorkOrderOperationsService
} from '$lib/server/repositories';
import { requireCompany } from '$lib/server/require-auth';
import { toTenantContext } from '$lib/server/tenant';

export const load: PageServerLoad = async ({ locals, params }) => {
	const { companyId } = requireCompany(locals);
	const ctx = toTenantContext(companyId);

	const order = await getRentalRepository().findById(ctx, params.id);
	if (!order) error(404, 'Orden no encontrada');
	if (!['confirmado', 'en_preparacion'].includes(String(order.status))) {
		error(400, 'La orden no está lista para entrega.');
	}

	const [items, customer, event] = await Promise.all([
		getRentalRepository().listItems(ctx, params.id),
		getCustomerRepository().findById(ctx, order.client_id),
		order.event_id ? getEventRepository().findById(ctx, order.event_id) : Promise.resolve(null)
	]);

	const deliverableItems = items
		.map((item) => ({
			...item,
			deliverable: getDeliverableQuantity(item)
		}))
		.filter((item) => item.deliverable > 0);

	return { order, items: deliverableItems, customer, event };
};

export const actions: Actions = {
	default: async ({ request, locals, params }) => {
		const { companyId } = requireCompany(locals);
		const ctx = toTenantContext(companyId);
		const form = await request.formData();

		const lines: Array<{ work_order_item_id: string; quantity: number }> = [];
		for (const [key, value] of form.entries()) {
			if (!key.startsWith('qty_')) continue;
			const itemId = key.slice(4);
			const quantity = Number(value);
			if (quantity > 0) lines.push({ work_order_item_id: itemId, quantity });
		}

		if (!lines.length) return fail(400, { error: 'Indique al menos un artículo con cantidad mayor a 0.' });

		try {
			const result = await getWorkOrderOperationsService().completeDelivery(ctx, params.id, {
				lines,
				received_by_name: String(form.get('received_by_name') ?? '').trim() || undefined,
				received_by_document: String(form.get('received_by_document') ?? '').trim() || undefined,
				notes: String(form.get('notes') ?? '').trim() || undefined
			});
			throw redirect(303, `/work-orders/${params.id}?delivered=${result.conduce.note_number}`);
		} catch (err) {
			if (err && typeof err === 'object' && 'status' in err && err.status === 303) throw err;
			const message = err instanceof Error ? err.message : 'No se pudo completar la entrega.';
			return fail(400, { error: message });
		}
	}
};
