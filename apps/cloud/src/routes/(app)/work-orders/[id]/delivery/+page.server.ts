import { error, fail, isRedirect, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { getDeliverableQuantity, isSerializedInventoryItem } from '@esr/core';
import {
	getCustomerRepository,
	getEventRepository,
	getInventoryRepository,
	getRentalRepository,
	getSerialRepository,
	getWorkOrderOperationsService
} from '$lib/server/repositories';
import { recordAuditLog } from '$lib/server/audit';
import { requirePermission } from '$lib/server/permissions';
import { toTenantContext } from '$lib/server/tenant';

export const load: PageServerLoad = async ({ locals, params }) => {
	const { companyId } = requirePermission(locals, 'operations.deliver');
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

	// Para los artículos serializados hay que ofrecer las unidades concretas
	// disponibles: en ellos la cantidad no se teclea, se elige.
	const withSerials = await Promise.all(
		deliverableItems.map(async (item) => {
			const inventoryItem = await getInventoryRepository().findById(ctx, item.item_id);
			if (!isSerializedInventoryItem(inventoryItem)) {
				return { ...item, serialized: false, availableSerials: [] };
			}
			return {
				...item,
				serialized: true,
				availableSerials: await getSerialRepository().listAvailableForItem(ctx, item.item_id)
			};
		})
	);

	return { order, items: withSerials, customer, event };
};

export const actions: Actions = {
	default: async ({ request, locals, params, getClientAddress }) => {
		const { companyId } = requirePermission(locals, 'operations.deliver');
		const ctx = toTenantContext(companyId);
		const form = await request.formData();

		const lines: Array<{
			work_order_item_id: string;
			quantity: number;
			serial_ids?: string[];
		}> = [];

		// Un artículo por cantidad manda `qty_<id>`; uno serializado manda una o
		// varias `serial_<id>` y NINGÚN `qty_`. Hay que recorrer ambos prefijos:
		// mirar solo `qty_` dejaba fuera los serializados por completo.
		const itemIds = new Set<string>();
		for (const key of form.keys()) {
			if (key.startsWith('qty_')) itemIds.add(key.slice(4));
			else if (key.startsWith('serial_')) itemIds.add(key.slice(7));
		}

		for (const itemId of itemIds) {
			// En un artículo serializado la cantidad la determinan los seriales
			// marcados, no el campo numérico.
			const serialIds = form.getAll(`serial_${itemId}`).map(String).filter(Boolean);
			if (serialIds.length) {
				lines.push({ work_order_item_id: itemId, quantity: serialIds.length, serial_ids: serialIds });
				continue;
			}
			const quantity = Number(form.get(`qty_${itemId}`) ?? 0);
			if (quantity > 0) lines.push({ work_order_item_id: itemId, quantity });
		}

		if (!lines.length) {
			return fail(400, {
				error: 'Indique al menos un artículo con cantidad mayor a 0, o marque sus unidades.'
			});
		}

		try {
			const result = await getWorkOrderOperationsService().completeDelivery(ctx, params.id, {
				lines,
				received_by_name: String(form.get('received_by_name') ?? '').trim() || undefined,
				received_by_document: String(form.get('received_by_document') ?? '').trim() || undefined,
				notes: String(form.get('notes') ?? '').trim() || undefined
			});
			await recordAuditLog({ locals, request, getClientAddress }, {
				action: 'order.delivered',
				entity_type: 'order',
				entity_id: String(params.id),
				description: `Entrega completada orden #${params.id}`
			});
			await recordAuditLog({ locals, request, getClientAddress }, {
				action: 'delivery_note.created',
				entity_type: 'conduce',
				entity_id: String(result.conduce.id),
				description: `Conduce de entrega ${result.conduce.note_number || result.conduce.id}`,
				metadata: { noteNumber: result.conduce.note_number }
			});
			await recordAuditLog({ locals, request, getClientAddress }, {
				action: 'delivery_note.completed',
				entity_type: 'conduce',
				entity_id: String(result.conduce.id),
				description: `Conduce completado ${result.conduce.note_number || result.conduce.id}`
			});
			throw redirect(303, `/work-orders/${params.id}?delivered=${result.conduce.note_number}`);
		} catch (err) {
			// `redirect()` de SvelteKit se lanza como excepcion: sin esto el catch
			// se lo tragaba y la accion respondia "no se pudo" aunque hubiera
			// funcionado. Se re-lanza para que el framework lo procese.
			if (isRedirect(err)) throw err;

			if (err && typeof err === 'object' && 'status' in err && err.status === 303) throw err;
			const message = err instanceof Error ? err.message : 'No se pudo completar la entrega.';
			return fail(400, { error: message });}
	}
};
