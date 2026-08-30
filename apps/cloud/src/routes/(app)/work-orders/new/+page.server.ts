import { fail, redirect } from '@sveltejs/kit';
import { SELECTABLE_STATES, todayISO } from '@esr/core';
import type { Actions, PageServerLoad } from './$types';
import { recordAuditLog } from '$lib/server/audit';
import { requirePermission } from '$lib/server/permissions';
import {
	getCustomerRepository,
	getEventRepository,
	getInventoryRepository,
	getWorkOrderCreationService
} from '$lib/server/repositories';
import { toTenantContext } from '$lib/server/tenant';

/**
 * Orden SIN cotizacion.
 *
 * A diferencia de la cotizacion, que nace vacia y se le añaden lineas despues,
 * la orden se crea entera de una vez. No es capricho: `work_orders` no tiene
 * estado borrador, la orden nace CONFIRMADA y aparta stock desde ese momento.
 * Una orden vacia y confirmada seria una orden que no se puede preparar y que
 * no reserva nada.
 */
export const load: PageServerLoad = async ({ locals, url }) => {
	const { companyId } = requirePermission(locals, 'work_orders.create');
	const ctx = toTenantContext(companyId);

	const [customers, events, inventory] = await Promise.all([
		getCustomerRepository().list(ctx, { state: SELECTABLE_STATES, limit: 200, offset: 0 }),
		getEventRepository().list(ctx, { limit: 200, offset: 0 }),
		getInventoryRepository().list(ctx, { state: SELECTABLE_STATES, limit: 300, offset: 0 })
	]);

	return {
		customers,
		events,
		inventory,
		clientId: url.searchParams.get('client')?.trim() || '',
		hoy: todayISO()
	};
};

export const actions: Actions = {
	default: async (event) => {
		const { companyId } = requirePermission(event.locals, 'work_orders.create');
		const ctx = toTenantContext(companyId);
		const form = await event.request.formData();

		const values = {
			client_id: String(form.get('client_id') ?? '').trim(),
			event_id: String(form.get('event_id') ?? '').trim(),
			date: String(form.get('date') ?? '').trim(),
			start_date: String(form.get('start_date') ?? '').trim(),
			end_date: String(form.get('end_date') ?? '').trim(),
			responsible_person: String(form.get('responsible_person') ?? '').trim(),
			vehicle: String(form.get('vehicle') ?? '').trim(),
			notes: String(form.get('notes') ?? '').trim()
		};

		// Las lineas viajan como tres arrays paralelos. Se emparejan por indice,
		// asi que un descuadre entre ellos es un formulario manipulado.
		const itemIds = form.getAll('line_item_id').map((v) => String(v).trim());
		const cantidades = form.getAll('line_quantity').map((v) => String(v).trim());
		const precios = form.getAll('line_price').map((v) => String(v).trim());
		if (itemIds.length !== cantidades.length || itemIds.length !== precios.length) {
			return fail(400, { error: 'Las líneas llegaron incompletas.', values });
		}

		const lines = itemIds
			.map((item_id, indice) => ({
				item_id,
				quantity: cantidades[indice],
				price: precios[indice]
			}))
			.filter((linea) => linea.item_id);

		let order;
		try {
			order = await getWorkOrderCreationService().createDirect(ctx, {
				client_id: values.client_id,
				event_id: values.event_id || null,
				date: values.date || null,
				start_date: values.start_date || null,
				end_date: values.end_date || null,
				responsible_person: values.responsible_person || null,
				vehicle: values.vehicle || null,
				notes: values.notes || null,
				lines
			});
		} catch (err) {
			// Aqui llegan tanto las reglas de `validateDirectOrderDraft` como la
			// falta de disponibilidad, ya traducidas a español por el servicio.
			return fail(400, { error: (err as Error).message, values });
		}

		await recordAuditLog(event, {
			action: 'order.created',
			entity_type: 'order',
			entity_id: String(order.id),
			description: `Orden ${order.order_number} creada sin cotización`,
			metadata: { lineas: lines.length, total: order.total }
		});

		redirect(303, `/work-orders/${order.id}`);
	}
};
