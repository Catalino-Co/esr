import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { recordAuditLog } from '$lib/server/audit';
import {
	getCompanyDocumentInfo,
	getCustomerRepository,
	getEventRepository,
	getQuoteRepository
} from '$lib/server/repositories';
import { requirePermission } from '$lib/server/permissions';
import { toTenantContext } from '$lib/server/tenant';

/**
 * Datos del PDF de una cotizacion.
 *
 * El PDF se arma en el CLIENTE con jsPDF, asi que la auditoria no puede
 * depender de que el cliente se acuerde de avisar. Se le da la vuelta: el
 * cliente pide los datos y el servidor audita al servirlos. Un solo viaje con
 * permiso, datos y registro.
 *
 * Es POST y no GET a proposito: registra `document.printed`, y un GET lo
 * dispararia cualquier prefetch de SvelteKit o cualquier recarga.
 *
 * Sustituye a la ruta `/quotes/[id]/print`, que auditaba al CARGAR la pagina
 * —aunque el usuario cerrara la pestaña sin imprimir— y renderizaba su propio
 * documento HTML. La auditoria no se pierde: se vuelve mas exacta.
 */
export const POST: RequestHandler = async (event) => {
	const { companyId } = requirePermission(event.locals, 'quotes.view');
	const ctx = toTenantContext(companyId);

	const quote = await getQuoteRepository().findById(ctx, event.params.id);
	if (!quote) error(404, 'Cotización no encontrada');

	const [items, customer, eventRow, company] = await Promise.all([
		getQuoteRepository().listItems(ctx, event.params.id),
		getCustomerRepository().findById(ctx, quote.client_id),
		quote.event_id ? getEventRepository().findById(ctx, quote.event_id) : Promise.resolve(null),
		getCompanyDocumentInfo(ctx)
	]);

	await recordAuditLog(event, {
		action: 'document.printed',
		entity_type: 'quote',
		entity_id: String(quote.id),
		description: `Impresión de cotización ${quote.quote_number || quote.id}`,
		metadata: { quoteNumber: quote.quote_number }
	});

	return json({
		company,
		quotation: {
			...quote,
			// `quoteDocumentNumber` del generador prefiere `quote_number` y cae al
			// id si no lo hay; Cloud siempre lo tiene.
			client_name: customer?.name ?? null,
			client_document: customer?.document_id ?? null,
			client_phone: customer?.phone ?? null,
			event_name: eventRow?.name ?? null
		},
		// El generador etiqueta las lineas con `quoteItemLabel`, que necesita
		// `item_id`/`package_id` para saber cual es una linea de paquete
		// heredada. Mandarlos es lo que evita que el nombre salga pelado.
		items: items.map((linea) => ({
			name: linea.name,
			item_id: linea.item_id ?? null,
			package_id: linea.package_id ?? null,
			quantity: linea.quantity,
			price: linea.price,
			total: linea.total
		}))
	});
};
