import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getCustomerRepository, getQuoteRepository } from '$lib/server/repositories';
import { requirePermission } from '$lib/server/permissions';
import { toTenantContext } from '$lib/server/tenant';

/**
 * Buscar una cotización por su NUMERO.
 *
 * Gemelo de `work-orders/buscar/+server.ts`: endpoint propio, no algo cargado
 * en el `load` de la pantalla, porque el objetivo es encontrar lo que NO esta
 * en pantalla —una cotización fuera de la ventana de fechas y de las cien
 * filas cargadas—.
 *
 * `GET`, no `POST`: no escribe nada y no deja auditoria.
 */
export const GET: RequestHandler = async ({ locals, url }) => {
	const { companyId } = requirePermission(locals, 'quotes.view');
	const ctx = toTenantContext(companyId);

	const termino = url.searchParams.get('q')?.trim() ?? '';
	if (termino.length < 2) return json({ cotizaciones: [] });

	const cotizaciones = await getQuoteRepository().searchByNumber(ctx, termino, 10);
	if (cotizaciones.length === 0) return json({ cotizaciones: [] });

	const clientes = await getCustomerRepository().list(ctx, { limit: 500, offset: 0 });
	const nombres = new Map(clientes.map((c) => [String(c.id), c.name]));

	return json({
		cotizaciones: cotizaciones.map((quote) => ({
			id: quote.id,
			quote_number: quote.quote_number,
			date: quote.date,
			status: quote.status,
			total: quote.total,
			client_name: nombres.get(String(quote.client_id ?? '')) ?? '—'
		}))
	});
};
