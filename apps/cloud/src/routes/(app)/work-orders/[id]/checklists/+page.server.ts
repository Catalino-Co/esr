import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import type { ChecklistItem } from '@esr/schemas';
import { getChecklistRepository, getRentalRepository, getWorkOrderOperationsService } from '$lib/server/repositories';
import { requirePermission } from '$lib/server/permissions';
import { toTenantContext } from '$lib/server/tenant';

export const load: PageServerLoad = async ({ locals, params }) => {
	const { companyId } = requirePermission(locals, 'work_orders.view');
	const ctx = toTenantContext(companyId);

	const order = await getRentalRepository().findById(ctx, params.id);
	if (!order) error(404, 'Orden no encontrada');

	const [outbound, returnItems] = await Promise.all([
		getChecklistRepository().findByWorkOrder(ctx, params.id, 'salida'),
		getChecklistRepository().findByWorkOrder(ctx, params.id, 'retorno')
	]);

	return { order, outbound, returnItems };
};

function parseChecklistItems(form: FormData, prefix: string): ChecklistItem[] {
	const itemIds = new Set<string>();
	for (const [key] of form.entries()) {
		if (key.startsWith(`${prefix}_actual_`)) itemIds.add(key.slice(`${prefix}_actual_`.length));
	}
	const items: ChecklistItem[] = [];
	for (const itemId of itemIds) {
		items.push({
			item_id: itemId,
			expected_quantity: Number(form.get(`${prefix}_expected_${itemId}`) ?? 0),
			actual_quantity: Number(form.get(`${prefix}_actual_${itemId}`) ?? 0),
			is_damaged: form.get(`${prefix}_damaged_${itemId}`) === 'on',
			is_missing: form.get(`${prefix}_missing_${itemId}`) === 'on',
			notes: String(form.get(`${prefix}_notes_${itemId}`) ?? '')
		});
	}
	return items;
}

export const actions: Actions = {
	saveOutbound: async ({ request, locals, params }) => {
		const { companyId } = requirePermission(locals, 'checklists.save');
		const ctx = toTenantContext(companyId);
		const form = await request.formData();
		const items = parseChecklistItems(form, 'out');
		try {
			await getWorkOrderOperationsService().saveChecklist(ctx, params.id, 'salida', items);
			return { success: true, type: 'salida' };
		} catch (err) {
			const message = err instanceof Error ? err.message : 'No se pudo guardar checklist de salida.';
			return fail(400, { error: message });
		}
	},
	saveReturn: async ({ request, locals, params }) => {
		const { companyId } = requirePermission(locals, 'checklists.save');
		const ctx = toTenantContext(companyId);
		const form = await request.formData();
		const items = parseChecklistItems(form, 'ret');
		try {
			await getWorkOrderOperationsService().saveChecklist(ctx, params.id, 'retorno', items);
			return { success: true, type: 'retorno' };
		} catch (err) {
			const message = err instanceof Error ? err.message : 'No se pudo guardar checklist de retorno.';
			return fail(400, { error: message });
		}
	}
};
