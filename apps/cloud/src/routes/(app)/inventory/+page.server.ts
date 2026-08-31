import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { recordAuditLog } from '$lib/server/audit';
import {
	getCategoryRepository,
	getCompanySettingsRepository,
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
const ESTADOS_FISICOS = ['disponible', 'mantenimiento', 'retirado'] as const;

export const load: PageServerLoad = async ({ locals, url, cookies }) => {
	const { companyId } = requirePermission(locals, 'inventory.view');
	const ctx = toTenantContext(companyId);

	const search = url.searchParams.get('search')?.trim() || undefined;
	const categoryId = url.searchParams.get('category')?.trim() || undefined;
	const lowStock = url.searchParams.get('bajo') === '1';
	const physicalStatus = url.searchParams.get('condicion')?.trim() || undefined;

	const [warehouses, categories, settings] = await Promise.all([
		getWarehouseRepository().list(ctx),
		getCategoryRepository().list(ctx),
		getCompanySettingsRepository().get(ctx)
	]);

	// La regla de valoración se decide en Configuración › Generales y viaja hasta
	// el SQL, que la aplica sobre el costo de las entradas.
	const valuationRule = settings?.default_valuation_rule === 'promedio3' ? 'promedio3' : 'ultimo';

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

	const items = await getInventoryRepository().listStock(ctx, {
		warehouse_id: warehouseId ?? null,
		search,
		category_id: categoryId,
		physical_status: physicalStatus,
		low_stock: lowStock,
		valuation_rule: valuationRule
	});

	return {
		items,
		warehouses,
		categories,
		warehouseId: warehouseId ?? '',
		search: search ?? '',
		categoryId: categoryId ?? '',
		physicalStatus: physicalStatus ?? '',
		lowStock,
		valuationRule
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
		// Vacío es «no lo sé», y eso se guarda como NULL, no como cero: la
		// valoración prefiere decir «—» a decir una cifra falsa.
		const costoBruto = String(form.get('unit_cost') ?? '').trim();
		const unitCost = costoBruto === '' ? null : Number(costoBruto);

		if (!itemId || !warehouseId) return fail(400, { error: 'Falta el artículo o el almacén.' });
		if (unitCost !== null && (!Number.isFinite(unitCost) || unitCost < 0)) {
			return fail(400, { error: 'El costo unitario debe ser un número mayor o igual a 0.' });
		}
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
				// Lo que costó la unidad EN ESTA ENTRADA, copiado aquí y no leído del
				// artículo al mirarlo: cambiar el precio de compra mañana no puede
				// reescribir lo que costó una compra de hace tres meses.
				unit_cost: unitCost,
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
	},

	/**
	 * Mínimo, condición física y ubicación de un artículo.
	 *
	 * Escribe en `item_inventory` y NO toca `items`: son las existencias de un
	 * artículo, no su definición. Y no mueve ni una unidad —para eso está
	 * `moveStock`, que además deja constancia de quién la movió—.
	 */
	saveInventory: async (event) => {
		const { companyId } = requirePermission(event.locals, 'inventory.update');
		const ctx = toTenantContext(companyId);
		const form = await event.request.formData();

		const itemId = String(form.get('item_id') ?? '').trim();
		const minStock = Number(form.get('min_stock') ?? 0);
		const physicalStatus = String(form.get('physical_status') ?? '').trim();
		const location = String(form.get('location') ?? '').trim();

		if (!itemId) return fail(400, { error: 'Falta el artículo.' });
		if (!Number.isFinite(minStock) || minStock < 0) {
			return fail(400, { error: 'El mínimo debe ser un número mayor o igual a 0.' });
		}
		if (!(ESTADOS_FISICOS as readonly string[]).includes(physicalStatus)) {
			return fail(400, { error: 'Condición física no válida.' });
		}

		await getInventoryRepository().saveInventory(ctx, itemId, {
			min_stock: minStock,
			physical_status: physicalStatus,
			location
		});

		await recordAuditLog(event, {
			action: 'inventory.settings_changed',
			entity_type: 'inventory',
			entity_id: itemId,
			description: `Mínimo ${minStock}, condición «${physicalStatus}»`
		});

		return { success: true };
	}
};
