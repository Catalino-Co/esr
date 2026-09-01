import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getCustomerRepository, getRentalRepository } from '$lib/server/repositories';
import { requirePermission } from '$lib/server/permissions';
import { toTenantContext } from '$lib/server/tenant';

/**
 * Buscar una orden por su NUMERO.
 *
 * Endpoint propio y no algo cargado en el `load` de la pantalla: el objetivo es
 * justo encontrar lo que NO esta en pantalla —una orden de otro año, fuera de la
 * ventana de fechas y de las cien filas cargadas—.
 *
 * `GET` y no `POST`: no escribe nada y no deja rastro en auditoria, asi que un
 * prefetch o un reintento no tienen consecuencias.
 *
 * `buscar` no choca con la ruta `[id=entero]`: aquella solo casa con digitos.
 */
export const GET: RequestHandler = async ({ locals, url }) => {
	const { companyId } = requirePermission(locals, 'work_orders.view');
	const ctx = toTenantContext(companyId);

	const termino = url.searchParams.get('q')?.trim() ?? '';
	// Con menos de dos caracteres la lista seria todo el archivo: no vale de nada
	// y cuesta una consulta por tecla.
	if (termino.length < 2) return json({ ordenes: [] });

	const ordenes = await getRentalRepository().searchByNumber(ctx, termino, 10);
	if (ordenes.length === 0) return json({ ordenes: [] });

	// El nombre del cliente es lo que distingue dos numeros parecidos. Se resuelve
	// aqui y no con un JOIN para no cambiar la forma de la fila que devuelve el
	// repositorio, que comparten seis llamadores.
	const clientes = await getCustomerRepository().list(ctx, { limit: 500, offset: 0 });
	const nombres = new Map(clientes.map((c) => [String(c.id), c.name]));

	return json({
		ordenes: ordenes.map((orden) => ({
			id: orden.id,
			order_number: orden.order_number,
			date: orden.date,
			status: orden.status,
			client_name: nombres.get(String(orden.client_id ?? '')) ?? '—'
		}))
	});
};
