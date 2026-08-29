import { error, fail, isRedirect, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { getReturnableQuantity } from '@esr/core';
import {
	getRentalRepository,
	getSerialRepository,
	getWorkOrderOperationsService
} from '$lib/server/repositories';
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

	// Las unidades concretas que salieron con esta orden: son exactamente las
	// que pueden volver. No se ofrecen otras.
	const deliveredSerials = await getSerialRepository().listByWorkOrder(ctx, params.id);
	const withSerials = returnableItems.map((item) => ({
		...item,
		deliveredSerials: deliveredSerials.filter(
			(serial) => String(serial.item_id) === String(item.item_id)
		)
	}));

	return { order, items: withSerials };
};

export const actions: Actions = {
	default: async ({ request, locals, params, getClientAddress }) => {
		const { companyId } = requirePermission(locals, 'operations.return');
		const ctx = toTenantContext(companyId);
		const form = await request.formData();

		const lines: Array<{
			work_order_item_id: string;
			quantity: number;
			condition: string;
			notes?: string;
			serial_ids?: string[];
		}> = [];
		// Igual que en la entrega: un artículo serializado manda `serial_<id>` y
		// ningún `qty_`, así que hay que recorrer los dos prefijos.
		const itemIds = new Set<string>();
		for (const key of form.keys()) {
			if (key.startsWith('qty_')) itemIds.add(key.slice(4));
			else if (key.startsWith('serial_')) itemIds.add(key.slice(7));
		}

		for (const itemId of itemIds) {
			const condition = String(form.get(`condition_${itemId}`) ?? 'good');
			const notes = String(form.get(`notes_${itemId}`) ?? '').trim() || undefined;
			if (!VALID_CONDITIONS.includes(condition)) {
				return fail(400, { error: 'Condición de devolución inválida.' });
			}

			// En un artículo serializado la cantidad devuelta la determinan las
			// unidades marcadas.
			const serialIds = form.getAll(`serial_${itemId}`).map(String).filter(Boolean);
			if (serialIds.length) {
				lines.push({
					work_order_item_id: itemId,
					quantity: serialIds.length,
					condition,
					notes,
					serial_ids: serialIds
				});
				continue;
			}

			const quantity = Number(form.get(`qty_${itemId}`));
			if (quantity <= 0) continue;
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
			// `redirect()` de SvelteKit se lanza como excepcion: sin esto el catch
			// se lo tragaba y la accion respondia "no se pudo" aunque hubiera
			// funcionado. Se re-lanza para que el framework lo procese.
			if (isRedirect(err)) throw err;

			if (err && typeof err === 'object' && 'status' in err && err.status === 303) throw err;
			const message = err instanceof Error ? err.message : 'No se pudo completar la devolución.';
			return fail(400, { error: message });}
	}
};
