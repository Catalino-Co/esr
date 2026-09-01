import { error, fail, isRedirect, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import {
	getCustomerRepository,
	getEventRepository,
	getIncidentRepository,
	getInvoiceRepository,
	getQuoteRepository,
	getRentalRepository,
	getStockMovementRepository,
	getWorkOrderOperationsService
} from '$lib/server/repositories';
import { recordAuditLog } from '$lib/server/audit';
import { requirePermission } from '$lib/server/permissions';
import { toTenantContext } from '$lib/server/tenant';

export const load: PageServerLoad = async ({ locals, params }) => {
	const { companyId } = requirePermission(locals, 'work_orders.view');
	const ctx = toTenantContext(companyId);

	const order = await getRentalRepository().findById(ctx, params.id);
	if (!order) error(404, 'Orden no encontrada');

	/*
	 * De aqui se fueron TRES consultas que nadie usaba:
	 *
	 *  - las dos de `getChecklistRepository`, cuyo resultado la plantilla no
	 *    mencionaba ni una vez;
	 *  - y el bloque `conducesWithItems`, que ademas hacia un N+1 —una consulta
	 *    de lineas por conduce— para pintar una tabla que solo leia la cabecera.
	 *
	 * La tabla de conduces se retira de la ficha. La ENTIDAD no se toca: es el
	 * pivote de la facturacion —no hay forma de emitir una factura sin al menos
	 * una entrega—, de `payments`, de `conduce_item_serials` y de la referencia
	 * de cada movimiento de stock. Se llega a ella desde Facturas.
	 */
	const [items, customer, event, quote, incidents, stockMovements] = await Promise.all([
		getRentalRepository().listItems(ctx, params.id),
		getCustomerRepository().findById(ctx, order.client_id),
		order.event_id ? getEventRepository().findById(ctx, order.event_id) : Promise.resolve(null),
		order.quotation_id ? getQuoteRepository().findById(ctx, order.quotation_id) : Promise.resolve(null),
		getIncidentRepository().findByWorkOrderId(ctx, params.id),
		getStockMovementRepository().listByWorkOrder(ctx, params.id)
	]);

	// Facturacion de la orden: lo ya facturado y lo que queda por facturar. La
	// segunda consulta es la que decide si el boton «Facturar» tiene sentido.
	const [invoices, billable] = await Promise.all([
		getInvoiceRepository().list(ctx, { work_order_id: params.id, state: [0, 1, 2], limit: 100 }),
		getInvoiceRepository().listBillableConduces(ctx, params.id)
	]);

	return { order, items, customer, event, quote, invoices, billable, incidents, stockMovements };
};

export const actions: Actions = {
	prepare: async ({ locals, params, request, getClientAddress }) => {
		const { companyId } = requirePermission(locals, 'work_orders.prepare');
		const ctx = toTenantContext(companyId);
		try {
			await getWorkOrderOperationsService().prepareOrder(ctx, params.id);
			await recordAuditLog({ locals, request, getClientAddress }, {
				action: 'order.prepared',
				entity_type: 'order',
				entity_id: String(params.id),
				description: `Orden preparada #${params.id}`
			});
			return { success: true };
		} catch (err) {
			const message = err instanceof Error ? err.message : 'No se pudo preparar la orden.';
			return fail(400, { error: message });
		}
	},
	cancel: async ({ locals, params, request, getClientAddress }) => {
		const { companyId } = requirePermission(locals, 'work_orders.cancel');
		const ctx = toTenantContext(companyId);
		try {
			await getRentalRepository().cancelOrder(ctx, params.id);
			await recordAuditLog({ locals, request, getClientAddress }, {
				action: 'order.cancelled',
				entity_type: 'order',
				entity_id: String(params.id),
				description: `Orden cancelada #${params.id}`
			});
			throw redirect(303, '/work-orders');
		} catch (err) {
			// `redirect()` de SvelteKit se lanza como excepcion: sin esto el catch
			// se lo tragaba y la accion respondia "no se pudo" aunque hubiera
			// funcionado. Se re-lanza para que el framework lo procese.
			if (isRedirect(err)) throw err;

			if (err && typeof err === 'object' && 'status' in err && err.status === 303) throw err;
			const message = err instanceof Error ? err.message : 'No se pudo cancelar la orden.';
			return fail(400, { error: message });}
	},
	close: async ({ locals, params, request, getClientAddress }) => {
		const { companyId } = requirePermission(locals, 'work_orders.close');
		const ctx = toTenantContext(companyId);
		try {
			await getWorkOrderOperationsService().closeOrder(ctx, params.id);
			await recordAuditLog({ locals, request, getClientAddress }, {
				action: 'order.closed',
				entity_type: 'order',
				entity_id: String(params.id),
				description: `Orden cerrada #${params.id}`
			});
			return { success: true };
		} catch (err) {
			const message = err instanceof Error ? err.message : 'No se pudo cerrar la orden.';
			return fail(400, { error: message });
		}
	}
};
