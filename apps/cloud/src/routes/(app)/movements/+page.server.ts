import type { PageServerLoad } from './$types';
import {
	getInventoryRepository,
	getStockMovementRepository,
	getWarehouseRepository
} from '$lib/server/repositories';
import { requirePermission } from '$lib/server/permissions';
import { toTenantContext } from '$lib/server/tenant';

/**
 * Movimientos de existencias: qué entró, qué salió y quién lo movió.
 *
 * Pantalla propia y no un diálogo dentro de Inventario: quitando el filtro de
 * artículo se ve el almacén entero, que es la mitad de para qué sirve. El botón
 * de la fila la abre ya filtrada.
 */

/** `YYYY-MM-DD` en hora LOCAL. `toISOString()` daría el día de UTC. */
function fechaLocal(date: Date): string {
	const mes = String(date.getMonth() + 1).padStart(2, '0');
	const dia = String(date.getDate()).padStart(2, '0');
	return `${date.getFullYear()}-${mes}-${dia}`;
}

/** Solo `YYYY-MM-DD`. Cualquier otra cosa se ignora en vez de llegar al SQL. */
function fecha(valor: string | null): string | undefined {
	return valor && /^\d{4}-\d{2}-\d{2}$/.test(valor) ? valor : undefined;
}

export const load: PageServerLoad = async ({ locals, url }) => {
	const { companyId } = requirePermission(locals, 'inventory.view');
	const ctx = toTenantContext(companyId);

	const itemId = url.searchParams.get('item')?.trim() || undefined;
	const warehouseId = url.searchParams.get('almacen')?.trim() || undefined;
	const type = url.searchParams.get('tipo')?.trim() || undefined;

	// Por defecto, el mes en curso: es la ventana con la que se trabaja a diario.
	const hoy = new Date();
	const desdePorDefecto = fechaLocal(new Date(hoy.getFullYear(), hoy.getMonth(), 1));
	const from = fecha(url.searchParams.get('desde')) ?? desdePorDefecto;
	const to = fecha(url.searchParams.get('hasta')) ?? fechaLocal(hoy);

	const [movements, warehouses, item] = await Promise.all([
		getStockMovementRepository().list(ctx, {
			item_id: itemId,
			warehouse_id: warehouseId,
			type,
			from,
			to
		}),
		getWarehouseRepository().list(ctx),
		// Para poder decir de qué artículo se está viendo el historial sin que la
		// pantalla tenga que adivinarlo de la primera fila: si no hay movimientos,
		// no habría primera fila.
		itemId ? getInventoryRepository().findById(ctx, itemId) : Promise.resolve(null)
	]);

	return {
		movements,
		warehouses,
		item,
		itemId: itemId ?? '',
		warehouseId: warehouseId ?? '',
		type: type ?? '',
		from,
		to
	};
};
