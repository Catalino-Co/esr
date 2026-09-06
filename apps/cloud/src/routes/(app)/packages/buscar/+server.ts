import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getPackageRepository } from '$lib/server/repositories';
import { requirePermission } from '$lib/server/permissions';
import { toTenantContext } from '$lib/server/tenant';

/**
 * Buscar un paquete por su CÓDIGO. Gemelo de `invoices/buscar/+server.ts`.
 *
 * `GET`, no escribe nada. `buscar` no choca con la ruta `[id=entero]`:
 * aquella solo casa con dígitos.
 */
export const GET: RequestHandler = async ({ locals, url }) => {
	const { companyId } = requirePermission(locals, 'packages.view');
	const ctx = toTenantContext(companyId);

	const termino = url.searchParams.get('q')?.trim() ?? '';
	if (termino.length < 2) return json({ paquetes: [] });

	const paquetes = await getPackageRepository().searchByCode(ctx, termino, 10);
	return json({
		paquetes: paquetes.map((p) => ({
			id: p.id,
			code: p.code,
			name: p.name,
			is_active: p.is_active
		}))
	});
};
