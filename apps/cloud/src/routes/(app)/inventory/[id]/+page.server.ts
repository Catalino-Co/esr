import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { isSerializedInventoryItem, parseSerialLines, uniqueSerialLines } from '@esr/core';
import {
	getCategoryRepository,
	getInventoryRepository,
	getSerialRepository,
	getSubcategoryRepository
} from '$lib/server/repositories';
import { recordAuditLog } from '$lib/server/audit';
import { requirePermission } from '$lib/server/permissions';
import { toTenantContext } from '$lib/server/tenant';
import { firstFormError, formErrorsToObject, validateCloudInventoryInput } from '$lib/server/validators';

export const load: PageServerLoad = async ({ locals, params }) => {
	const { companyId } = requirePermission(locals, 'inventory.view');
	const ctx = toTenantContext(companyId);
	const item = await getInventoryRepository().findById(ctx, params.id);
	if (!item) error(404, 'Artículo no encontrado');

	const [categories, subcategories, availability, serials] = await Promise.all([
		getCategoryRepository().list(ctx),
		item.category_id ? getSubcategoryRepository().list(ctx, item.category_id) : Promise.resolve([]),
		getInventoryRepository().findAvailableByDateRange(ctx, { item_id: item.id }),
		// Solo tiene sentido pedirlos si el artículo se lleva por unidades.
		isSerializedInventoryItem(item)
			? getSerialRepository().findByItem(ctx, params.id)
			: Promise.resolve([])
	]);

	return {
		item,
		categories,
		subcategories,
		availability: availability[0] ?? null,
		serials,
		isSerialized: isSerializedInventoryItem(item)
	};
};

export const actions: Actions = {
	/**
	 * Alta de seriales en bloque: uno por linea. En un articulo serializado la
	 * existencia NO se teclea, se deriva de cuantas unidades hay registradas.
	 */
	addSerials: async (event) => {
		const { companyId } = requirePermission(event.locals, 'inventory.update');
		const ctx = toTenantContext(companyId);
		const form = await event.request.formData();

		const item = await getInventoryRepository().findById(ctx, event.params.id);
		if (!item) return fail(404, { error: 'Artículo no encontrado.' });
		if (!isSerializedInventoryItem(item)) {
			return fail(400, { error: 'Este artículo no se lleva por número de serie.' });
		}

		const entered = uniqueSerialLines(parseSerialLines(String(form.get('serials') ?? '')));
		if (!entered.length) return fail(400, { error: 'Escriba al menos un número de serie.' });

		const created: string[] = [];
		const duplicated: string[] = [];
		for (const serialNumber of entered) {
			// Se consulta antes para poder informar cuál se repetía, en vez de
			// dejar que el índice único corte el lote entero.
			const existing = await getSerialRepository().findBySerialNumber(ctx, event.params.id, serialNumber);
			if (existing) {
				duplicated.push(serialNumber);
				continue;
			}
			await getSerialRepository().create(ctx, event.params.id, serialNumber);
			created.push(serialNumber);
		}

		if (created.length) {
			await syncSerializedQuantities(ctx, event.params.id);
			await recordAuditLog(event, {
				action: 'inventory.serials_added',
				entity_type: 'inventory_item',
				entity_id: String(event.params.id),
				description: `${created.length} serial(es) agregados a ${item.name}`
			});
		}

		const base = created.length ? `${created.length} serial(es) agregados.` : 'No se agregó ninguno.';
		return {
			success: duplicated.length
				? `${base} Ya existían: ${duplicated.join(', ')}.`
				: base
		};
	},

	setSerialStatus: async (event) => {
		const { companyId } = requirePermission(event.locals, 'inventory.update');
		const ctx = toTenantContext(companyId);
		const form = await event.request.formData();

		const serialId = String(form.get('serial_id') ?? '').trim();
		const status = String(form.get('status') ?? '').trim();
		const allowed = ['disponible', 'mantenimiento', 'retirado'];
		if (!serialId) return fail(400, { error: 'Falta el identificador del serial.' });
		if (!allowed.includes(status)) {
			// 'entregado' y 'reservado' los pone la operación, no esta pantalla.
			return fail(400, { error: 'Ese estado solo lo cambia la operación de entrega o devolución.' });
		}

		const serials = await getSerialRepository().findByItem(ctx, event.params.id);
		const serial = serials.find((s) => String(s.id) === serialId);
		if (!serial) return fail(404, { error: 'Serial no encontrado.' });
		if (serial.status === 'entregado') {
			return fail(400, { error: 'Ese serial está entregado; se libera al registrar la devolución.' });
		}

		await getSerialRepository().setStatus(ctx, serialId, status);
		await syncSerializedQuantities(ctx, event.params.id);

		await recordAuditLog(event, {
			action: 'inventory.serial_status_changed',
			entity_type: 'inventory_item',
			entity_id: String(event.params.id),
			description: `Serial ${serial.serial_number} → ${status}`
		});

		return { success: `Serial ${serial.serial_number} marcado como ${status}.` };
	},

	update: async ({ request, locals, params, getClientAddress }) => {
		const { companyId } = requirePermission(locals, 'inventory.update');
		const ctx = toTenantContext(companyId);
		const form = await request.formData();
		const totalQuantity = Number(form.get('total_quantity') ?? 0);

		const values = {
			name: String(form.get('name') ?? '').trim(),
			internal_code: String(form.get('internal_code') ?? '').trim(),
			description: String(form.get('description') ?? '').trim(),
			category_id: String(form.get('category_id') ?? '').trim(),
			subcategory_id: String(form.get('subcategory_id') ?? '').trim(),
			notes: String(form.get('notes') ?? '').trim(),
			status: String(form.get('status') ?? 'disponible').trim(),
			total_quantity: totalQuantity,
			rental_price: Number(form.get('rental_price') ?? 0)
		};

		// Pasar a serializado no se puede deshacer a la ligera: si ya hay
		// unidades registradas, volver a "por cantidad" las dejaría huérfanas.

		const validationErrors = validateCloudInventoryInput(values);
		if (validationErrors.length) {
			return fail(400, { error: firstFormError(validationErrors), fieldErrors: formErrorsToObject(validationErrors) });
		}

		const current = await getInventoryRepository().findById(ctx, params.id);
		if (!current) error(404, 'Artículo no encontrado');

		const wantsSerial = String(form.get('item_type') ?? 'cantidad') === 'serializado';
		const serialCount = wantsSerial
			? (await getSerialRepository().findByItem(ctx, params.id)).length
			: 0;

		// En un artículo serializado las existencias son un reflejo de sus
		// unidades, así que la cantidad tecleada se ignora.
		const effectiveTotal = wantsSerial ? serialCount : totalQuantity;
		const availableQuantity = wantsSerial
			? (await getSerialRepository().findByItem(ctx, params.id)).filter(
					(serial) => serial.status === 'disponible'
				).length
			: Math.min(current.available_quantity ?? totalQuantity, totalQuantity);

		await getInventoryRepository().update(ctx, params.id, {
			item_type: wantsSerial ? 'serializado' : 'cantidad',
			uses_serial: wantsSerial ? 1 : 0,
			name: values.name,
			internal_code: values.internal_code || undefined,
			description: values.description || undefined,
			category_id: values.category_id || '',
			subcategory_id: values.subcategory_id || undefined,
			notes: values.notes || undefined,
			status: values.status,
			total_quantity: effectiveTotal,
			available_quantity: availableQuantity,
			rental_price: values.rental_price
		});

		await recordAuditLog({ locals, request, getClientAddress }, {
			action: 'inventory.updated',
			entity_type: 'inventory',
			entity_id: String(params.id),
			description: `Artículo actualizado: ${values.name}`
		});

		return { success: true };
	},
	deactivate: async ({ locals, params, request, getClientAddress }) => {
		const { companyId } = requirePermission(locals, 'inventory.deactivate');
		const ctx = toTenantContext(companyId);
		const item = await getInventoryRepository().findById(ctx, params.id);
		if (!item) error(404, 'Artículo no encontrado');
		await getInventoryRepository().deactivate(ctx, params.id);
		await recordAuditLog({ locals, request, getClientAddress }, {
			action: 'inventory.deactivated',
			entity_type: 'inventory',
			entity_id: String(params.id),
			description: `Artículo desactivado: ${item.name}`
		});
		throw redirect(303, '/inventory');
	}
};

/**
 * En un articulo serializado las existencias son un reflejo de sus unidades:
 * total = seriales registrados, disponible = los que estan 'disponible'.
 * Teclearlas a mano las dejaria mintiendo en cuanto sale o vuelve una unidad.
 */
async function syncSerializedQuantities(
	ctx: ReturnType<typeof toTenantContext>,
	itemId: string
): Promise<void> {
	const serials = await getSerialRepository().findByItem(ctx, itemId);
	const available = serials.filter((serial) => serial.status === 'disponible').length;
	const retired = serials.filter((serial) => serial.status === 'retirado').length;

	await getInventoryRepository().update(ctx, itemId, {
		total_quantity: serials.length - retired,
		available_quantity: available
	});
}
