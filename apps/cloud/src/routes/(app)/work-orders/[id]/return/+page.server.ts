import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { getReturnableQuantity } from '@esr/core';
import { getRentalRepository, getWorkOrderOperationsService } from '$lib/server/repositories';
import { recordAuditLog } from '$lib/server/audit';
import { requirePermission } from '$lib/server/permissions';
import { toTenantContext } from '$lib/server/tenant';

const VALID_CONDITIONS = ['good', 'fair', 'damaged', 'lost'];

export const load: PageServerLoad = async ({ locals, params }) => {
	const { companyId } = requirePermission(locals, 'operations.return');
	const ctx = toTenantContext(companyId);

	const order = await getRentalRepository().findById(ctx, params.id);
	if (!order) error(404, 'Orden no encontrada');
	if (!['entregado', 'parcialmente_devuelto'].includes(String(order.status))) {
		error(400, 'La orden no está lista para devolución.');
	}

	const items = await getRentalRepository().listItems(ctx, params.id);
	const returnableItems = items
		.map((item) => ({
			...item,
			returnable: getReturnableQuantity(item)
		}))
		.filter((item) => item.returnable > 0);

	return { order, items: returnableItems };
};

export const actions: Actions = {
	default: async ({ request, locals, params, getClientAddress }) => {
		const { companyId } = requirePermission(locals, 'operations.return');
		const ctx = toTenantContext(companyId);
		const form = await request.formData();

		const lines: Array<{ work_order_item_id: string; quantity: number; condition: string; notes?: string }> = [];
		const itemIds = new Set<string>();
		for (const [key] of form.entries()) {
			if (key.startsWith('qty_')) itemIds.add(key.slice(4));
		}

		for (const itemId of itemIds) {
			const quantity = Number(form.get(`qty_${itemId}`));
			const condition = String(form.get(`condition_${itemId}`) ?? 'good');
			const notes = String(form.get(`notes_${itemId}`) ?? '').trim() || undefined;
			if (quantity <= 0) continue;
			if (!VALID_CONDITIONS.includes(condition)) {
				return fail(400, { error: 'Condición de devolución inválida.' });
			}
			lines.push({ work_order_item_id: itemId, quantity, condition, notes });
		}

		if (!lines.length) return fail(400, { error: 'Indique al menos un artículo con cantidad mayor a 0.' });

		try {
			const result = await getWorkOrderOperationsService().completeReturn(ctx, params.id, {
				lines,
				notes: String(form.get('notes') ?? '').trim() || undefined
			});
			await recordAuditLog({ locals, request, getClientAddress }, {
				action: 'order.returned',
				entity_type: 'order',
				entity_id: String(params.id),
				description: `Devolución completada orden #${params.id}`
			});
			await recordAuditLog({ locals, request, getClientAddress }, {
				action: 'delivery_note.created',
				entity_type: 'conduce',
				entity_id: String(result.conduce.id),
				description: `Conduce de devolución ${result.conduce.note_number || result.conduce.id}`
			});
			await recordAuditLog({ locals, request, getClientAddress }, {
				action: 'delivery_note.completed',
				entity_type: 'conduce',
				entity_id: String(result.conduce.id),
				description: `Conduce de devolución completado ${result.conduce.note_number || result.conduce.id}`
			});
			const incidentCount = result.incidents.length;
			throw redirect(
				303,
				`/work-orders/${params.id}?returned=${result.conduce.note_number}${incidentCount ? `&incidents=${incidentCount}` : ''}`
			);
		} catch (err) {
			if (err && typeof err === 'object' && 'status' in err && err.status === 303) throw err;
			const message = err instanceof Error ? err.message : 'No se pudo completar la devolución.';
			return fail(400, { error: message });
		}
	}
};
