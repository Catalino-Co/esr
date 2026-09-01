import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { recordAuditLog } from '$lib/server/audit';
import {
	getCompanyDocumentInfo,
	getCustomerRepository,
	getEventRepository,
	getRentalRepository
} from '$lib/server/repositories';
import { requirePermission } from '$lib/server/permissions';
import { toTenantContext } from '$lib/server/tenant';

/**
 * Datos de la hoja de trabajo de una orden.
 *
 * Sustituye a la ruta `/work-orders/[id]/print`, que renderizaba un documento
 * HTML con `renderOrderDocument` —precios, totales y la misma plantilla base
 * que la factura— y que ademas auditaba al CARGAR la pagina, aunque el usuario
 * cerrara la pestaña sin imprimir.
 *
 * Es POST y no GET a proposito: registra `document.printed`, y un GET lo
 * dispararia cualquier prefetch de SvelteKit o cualquier recarga.
 *
 * El PDF se arma en el CLIENTE con jsPDF, el mismo generador que usa ESR Pro.
 */
export const POST: RequestHandler = async (event) => {
	const { companyId } = requirePermission(event.locals, 'work_orders.view');
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

	return json({
		company,
		order: {
			...order,
			client_name: customer?.name ?? null,
			event_name: eventRow?.name ?? null
		},
		// Proyeccion explicita: la hoja solo necesita codigo, nombre y cantidad.
		// Mandar la fila entera sacaria el precio a un documento que justamente
		// no debe llevarlo.
		items: items.map((linea) => ({
			internal_code: linea.internal_code ?? null,
			name: linea.name,
			quantity: linea.quantity
		}))
	});
};
