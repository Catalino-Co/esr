import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getInvoiceRepository } from '$lib/server/repositories';
import { requirePermission } from '$lib/server/permissions';
import { toTenantContext } from '$lib/server/tenant';

/**
 * Buscar una factura por su NUMERO. Gemelo de `work-orders/buscar/+server.ts`
 * y `quotes/buscar/+server.ts`.
 *
 * `GET`, no escribe nada. `buscar` no choca con la ruta `[id=entero]`: aquella
 * solo casa con digitos.
 *
 * A diferencia de sus gemelos no hace falta una segunda consulta para el
 * nombre del cliente: `searchByNumber` ya lo trae unido.
 */
export const GET: RequestHandler = async ({ locals, url }) => {
	const { companyId } = requirePermission(locals, 'invoices.view');
	const ctx = toTenantContext(companyId);

	const termino = url.searchParams.get('q')?.trim() ?? '';
	if (termino.length < 2) return json({ facturas: [] });

	const facturas = await getInvoiceRepository().searchByNumber(ctx, termino, 10);

	return json({
		facturas: facturas.map((f) => ({
			id: f.id,
			invoice_number: f.invoice_number,
			date: f.date,
			status: f.status,
			client_name: f.client_name ?? '—'
		}))
	});
};
