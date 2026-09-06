import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isSerializedInventoryItem } from '@esr/core';
import { getInventoryRepository, getSerialRepository } from '$lib/server/repositories';
import { requirePermission } from '$lib/server/permissions';
import { toTenantContext } from '$lib/server/tenant';

/**
 * Donde esta repartido un articulo.
 *
 * Endpoint y no datos del `load` de la pantalla: la distribucion se mira de un
 * articulo cada vez —al abrir el dialogo—, y traerla de los cien del listado
 * para que se use la de uno seria pagar cien veces por una.
 *
 * Sirve a los dos dialogos de Inventario: el de «Existencias por almacen» y el
 * de movimiento, que necesita saber cuanto hay en el almacen que se elija para
 * no decir «aqui hay 10» mientras se registra la entrada en otro sitio.
 */
export const GET: RequestHandler = async ({ locals, url }) => {
	const { companyId } = requirePermission(locals, 'inventory.view');
	const ctx = toTenantContext(companyId);

	const itemId = url.searchParams.get('item')?.trim();
	if (!itemId) error(400, 'Falta el artículo.');

	const item = await getInventoryRepository().findById(ctx, itemId);
	if (!item) error(404, 'Artículo no encontrado');

	const distribution = await getInventoryRepository().listStockByWarehouse(ctx, itemId);

	// En un serializado la distribucion son unidades concretas, y moverlas de
	// almacen es mover ESA unidad: por eso viajan con la respuesta.
	const serials = isSerializedInventoryItem(item)
		? await getSerialRepository().findByItem(ctx, itemId)
		: [];

	return json({ distribution, serials, serialized: isSerializedInventoryItem(item) });
};
