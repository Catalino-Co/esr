import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { recordAuditLog } from '$lib/server/audit';
import {
	getCompanyDocumentInfo,
	getCustomerRepository,
	getEventRepository,
	getQuoteRepository,
	getRentalRepository
} from '$lib/server/repositories';
import { requirePermission } from '$lib/server/permissions';
import { toTenantContext } from '$lib/server/tenant';

/**
 * Datos de la hoja del evento.
 *
 * Calcado del endpoint de la cotizacion, y por las mismas dos razones:
 *
 * - El PDF se arma en el CLIENTE con jsPDF, asi que la auditoria no puede
 *   depender de que el cliente se acuerde de avisar: se registra aqui.
 * - Es POST y no GET a proposito. Registra `document.printed`, y un GET lo
 *   dispararia cualquier prefetch de SvelteKit o cualquier recarga.
 *
 * La cotizacion y la orden salen del vinculo REAL —`quotations.event_id` y
 * `work_orders.event_id`—, nunca de `events.quotation_id`, que esta muerta.
 * Se manda la PRIMERA de cada una: el resumen es de una linea por documento.
 */
export const POST: RequestHandler = async (event) => {
	const { companyId } = requirePermission(event.locals, 'events.view');
	const ctx = toTenantContext(companyId);

	const evento = await getEventRepository().findById(ctx, event.params.id);
	if (!evento) error(404, 'Evento no encontrado');

	const [customer, quotes, orders, company] = await Promise.all([
		evento.client_id
			? getCustomerRepository().findById(ctx, evento.client_id)
			: Promise.resolve(null),
		getQuoteRepository().findByEventId(ctx, event.params.id),
		getRentalRepository().findByEventId(ctx, event.params.id),
		getCompanyDocumentInfo(ctx)
	]);

	await recordAuditLog(event, {
		action: 'document.printed',
		entity_type: 'event',
		entity_id: String(evento.id),
		description: `Impresión de evento ${evento.name}`
	});

	const quote = quotes[0] ?? null;
	const order = orders[0] ?? null;

	return json({
		company,
		event: { ...evento, client_name: customer?.name ?? null },
		// Proyecciones explicitas: el resumen solo necesita numero, estado y
		// total. Mandar la fila entera sacaria a un PDF campos que nadie pinta.
		quote: quote
			? { id: quote.id, quote_number: quote.quote_number, status: quote.status, total: quote.total }
			: null,
		order: order
			? { id: order.id, order_number: order.order_number, status: order.status }
			: null
	});
};
