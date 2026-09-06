import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getCustomerRepository, getEventRepository } from '$lib/server/repositories';
import { requirePermission } from '$lib/server/permissions';
import { toTenantContext } from '$lib/server/tenant';

/**
 * Buscar un evento por su NOMBRE. Gemelo de `work-orders/buscar/+server.ts`
 * y `quotes/buscar/+server.ts`, adaptado: sin numero de documento, se busca
 * por texto (nombre/lugar) en vez de por igualdad exacta.
 *
 * `GET`, no escribe nada. `buscar` no choca con la ruta `[id=entero]`:
 * aquella solo casa con digitos.
 *
 * `searchByName` no trae `client_name` unido —igual que `list()`—, asi que
 * el nombre del cliente se resuelve aqui, calcado de `work-orders/buscar/+server.ts`.
 */
export const GET: RequestHandler = async ({ locals, url }) => {
	const { companyId } = requirePermission(locals, 'events.view');
	const ctx = toTenantContext(companyId);

	const termino = url.searchParams.get('q')?.trim() ?? '';
	if (termino.length < 2) return json({ eventos: [] });

	const eventos = await getEventRepository().searchByName(ctx, termino, 10);
	if (eventos.length === 0) return json({ eventos: [] });

	const clientes = await getCustomerRepository().list(ctx, { limit: 500, offset: 0 });
	const nombres = new Map(clientes.map((c) => [String(c.id), c.name]));

	return json({
		eventos: eventos.map((ev) => ({
			id: ev.id,
			name: ev.name,
			date: ev.date,
			status: ev.status,
			client_name: nombres.get(String(ev.client_id ?? '')) ?? '—'
		}))
	});
};
