import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { recordAuditLog } from '$lib/server/audit';
import {
	getCategoryRepository,
	getInventoryRepository,
	getWarehouseRepository
} from '$lib/server/repositories';
import { requirePermission } from '$lib/server/permissions';
import { toTenantContext } from '$lib/server/tenant';

/**
 * Inventario: cuánto hay y DÓNDE.
 *
 * Separado del catálogo, que vive en Configuración › Artículos y responde a otra
 * pregunta —qué existe—. Por eso aquí no hay estados: activar, inactivar o
 * archivar un artículo no es algo que se decida mirando existencias.
 */

/** Cookie del almacén elegido, para no volver a preguntarlo en cada visita. */
const COOKIE_ALMACEN = 'esr_almacen';
const UN_AÑO = 60 * 60 * 24 * 365;

const TIPOS_MOVIMIENTO = ['entrada', 'salida', 'ajuste'] as const;

export const load: PageServerLoad = async ({ locals, url, cookies }) => {
	const { companyId } = requirePermission(locals, 'inventory.view');
	const ctx = toTenantContext(companyId);

	const search = url.searchParams.get('search')?.trim() || undefined;
	const categoryId = url.searchParams.get('category')?.trim() || undefined;
	const lowStock = url.searchParams.get('bajo') === '1';

	const [warehouses, categories] = await Promise.all([
		getWarehouseRepository().list(ctx),
		getCategoryRepository().list(ctx)
	]);

	/*
	 * El almacén sale de la URL, y si no de la cookie, y si no del primero.
	 *
	 * La URL manda para que un enlace compartido lleve a donde dice. La cookie
	 * es solo la comodidad de no reelegir cada vez.
	 */
	const pedido = url.searchParams.get('almacen')?.trim();
	const recordado = cookies.get(COOKIE_ALMACEN);
	const existe = (id: string | undefined) =>
		id && warehouses.some((w) => String(w.id) === id) ? id : undefined;

	const warehouseId =
		existe(pedido) ?? existe(recordado) ?? (warehouses[0] ? String(warehouses[0].id) : undefined);

	if (warehouseId && warehouseId !== recordado) {
		cookies.set(COOKIE_ALMACEN, warehouseId, { path: '/', maxAge: UN_AÑO, httpOnly: true, sameSite: 'lax' });
	}

	const items = await getInventoryRepository().listByWarehouse(ctx, {
		warehouse_id: warehouseId ?? null,
		search,
		category_id: categoryId,
		low_stock: lowStock
	});

	return {
		items,
		warehouses,
		categories,
		warehouseId: warehouseId ?? '',
		search: search ?? '',
		categoryId: categoryId ?? '',
		lowStock
	};
};

export const actions: Actions = {
	/** Entrada, salida o ajuste de existencias en el almacén elegido. */
	moveStock: async (event) => {
		const { companyId } = requirePermission(event.locals, 'inventory.update');
		const ctx = toTenantContext(companyId);
		const form = await event.request.formData();

		const itemId = String(form.get('item_id') ?? '').trim();
		const warehouseId = String(form.get('warehouse_id') ?? '').trim();
		const type = String(form.get('type') ?? '').trim();
		const quantity = Number(form.get('quantity') ?? 0);
		const notes = String(form.get('notes') ?? '').trim();

		if (!itemId || !warehouseId) return fail(400, { error: 'Falta el artículo o el almacén.' });
		if (!(TIPOS_MOVIMIENTO as readonly string[]).includes(type)) {
			return fail(400, { error: 'Tipo de movimiento no válido.' });
		}
		// Un ajuste a cero es legítimo —«aquí no queda nada»—; una entrada o una
		// salida de cero no mueven nada y solo ensucian el historial.
		if (!Number.isFinite(quantity) || quantity < 0 || (type !== 'ajuste' && quantity === 0)) {
			return fail(400, { error: 'La cantidad debe ser un número mayor que cero.' });
		}

		try {
			const resultado = await getInventoryRepository().moveStock(ctx, {
				item_id: itemId,
				warehouse_id: warehouseId,
				type: type as 'entrada' | 'salida' | 'ajuste',
				quantity,
				notes: notes || null,
				// El responsable. Sin esto el historial no puede decir quién movió
				// qué, que es la mitad de para qué sirve.
				user_id: event.locals.user?.id ?? null
			});

			await recordAuditLog(event, {
				action: 'inventory.stock_moved',
				entity_type: 'inventory',
				entity_id: itemId,
				description: `Movimiento de stock (${type}): ${resultado.delta >= 0 ? '+' : ''}${resultado.delta}`,
				metadata: { type, delta: resultado.delta, quantity: resultado.quantity, warehouseId }
			});

			return { success: true };
		} catch (error) {
			// Los mensajes del repositorio SON la interfaz —«no hay tanto que
			// sacar: en este almacén hay 3»— y llegan tal cual.
			return fail(400, { error: error instanceof Error ? error.message : 'No se pudo registrar el movimiento.' });
		}
	}
};
