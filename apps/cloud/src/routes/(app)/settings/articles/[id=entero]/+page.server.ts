import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { can, isRecordState, isSerializedInventoryItem, parseSerialLines, uniqueSerialLines } from '@esr/core';
import {
	getCategoryRepository,
	getInventoryRepository,
	getSerialRepository,
	getStockMovementRepository,
	getSubcategoryRepository,
	getSupplierRepository,
	getUnitOfMeasureRepository,
	getWarehouseRepository
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

	// Ni existencias ni disponibilidad EN LA CIFRA: esta pantalla es el CATÁLOGO
	// y responde «qué es y cuánto vale». Pero DÓNDE está y QUIÉN lo suministra sí
	// se administran aquí desde esta reforma, en sus propias tarjetas —son
	// decisiones del artículo, no un reporte que se repita en dos sitios.
	const [categories, subcategories, serials, suppliers, units, warehouses, distribution, itemSuppliers] =
		await Promise.all([
			getCategoryRepository().list(ctx),
			item.category_id ? getSubcategoryRepository().list(ctx, item.category_id) : Promise.resolve([]),
			isSerializedInventoryItem(item)
				? getSerialRepository().findByItem(ctx, params.id)
				: Promise.resolve([]),
			getSupplierRepository().list(ctx),
			getUnitOfMeasureRepository().list(ctx),
			getWarehouseRepository().list(ctx),
			getInventoryRepository().listStockByWarehouse(ctx, params.id),
			getInventoryRepository().listSuppliersForItem(ctx, params.id)
		]);

	return {
		item,
		categories,
		subcategories,
		serials,
		suppliers,
		units,
		warehouses,
		distribution,
		itemSuppliers,
		isSerialized: isSerializedInventoryItem(item),
		puedeArchivar: can(locals.role, 'inventory.archive')
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
		if (!item) return fail(404, { scope: 'seriales', error: 'Artículo no encontrado.' });
		if (!isSerializedInventoryItem(item)) {
			return fail(400, { scope: 'seriales', error: 'Este artículo no se lleva por número de serie.' });
		}

		const entered = uniqueSerialLines(parseSerialLines(String(form.get('serials') ?? '')));
		if (!entered.length) return fail(400, { scope: 'seriales', error: 'Escriba al menos un número de serie.' });

		// El almacén no es opcional: una unidad física está en algún sitio, y sin
		// decir dónde no se cuenta en ninguno —así estaban los seriales dados de
		// alta antes de esta reforma, visibles en el total e invisibles en cada
		// almacén—.
		const warehouseId = String(form.get('warehouse_id') ?? '').trim();
		if (!warehouseId) return fail(400, { scope: 'seriales', error: 'Elija el almacén al que entran.' });

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
			await getSerialRepository().create(ctx, event.params.id, serialNumber, warehouseId);
			created.push(serialNumber);
		}

		if (created.length) {
			// Registrar unidades SUBE las existencias de ese almacén, así que deja
			// su asiento: ninguna existencia se mueve sin rastro. No descuadra
			// nada, porque en un serializado la cantidad se cuenta de las unidades
			// y no de la bitácora.
			await getStockMovementRepository().create(ctx, {
				item_id: event.params.id,
				movement_type: 'entrada',
				quantity: created.length,
				warehouse_id: warehouseId,
				user_id: event.locals.user?.id ?? null,
				notes: `Alta de ${created.length} unidad(es): ${created.join(', ')}`
			});

			await recordAuditLog(event, {
				action: 'inventory.serials_added',
				entity_type: 'inventory_item',
				entity_id: String(event.params.id),
				description: `${created.length} serial(es) agregados a ${item.name}`
			});
		}

		const base = created.length ? `${created.length} serial(es) agregados.` : 'No se agregó ninguno.';
		return {
			scope: 'seriales',
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
		if (!serialId) return fail(400, { scope: 'seriales', error: 'Falta el identificador del serial.' });
		if (!allowed.includes(status)) {
			// 'entregado' y 'reservado' los pone la operación, no esta pantalla.
			return fail(400, { scope: 'seriales', error: 'Ese estado solo lo cambia la operación de entrega o devolución.' });
		}

		const serials = await getSerialRepository().findByItem(ctx, event.params.id);
		const serial = serials.find((s) => String(s.id) === serialId);
		if (!serial) return fail(404, { scope: 'seriales', error: 'Serial no encontrado.' });
		if (serial.status === 'entregado') {
			return fail(400, { scope: 'seriales', error: 'Ese serial está entregado; se libera al registrar la devolución.' });
		}

		await getSerialRepository().setStatus(ctx, serialId, status);

		await recordAuditLog(event, {
			action: 'inventory.serial_status_changed',
			entity_type: 'inventory_item',
			entity_id: String(event.params.id),
			description: `Serial ${serial.serial_number} → ${status}`
		});

		return { scope: 'seriales', success: `Serial ${serial.serial_number} marcado como ${status}.` };
	},

	/**
	 * Mueve UNA unidad serializada de almacén. Calcada tal cual de
	 * `inventory/+page.server.ts`: aquí la unidad ya se ve en la tabla de
	 * seriales, así que trasladarla no debería obligar a salir a Inventario.
	 */
	moveSerial: async (event) => {
		const { companyId } = requirePermission(event.locals, 'inventory.update');
		const ctx = toTenantContext(companyId);
		const form = await event.request.formData();

		const serialId = String(form.get('serial_id') ?? '').trim();
		const warehouseId = String(form.get('warehouse_id') ?? '').trim();
		if (!serialId || !warehouseId) return fail(400, { scope: 'seriales', error: 'Falta la unidad o el almacén.' });

		try {
			const { serial, from } = await getSerialRepository().setWarehouse(ctx, serialId, warehouseId);
			if (String(from ?? '') === warehouseId) return { scope: 'seriales', success: true };

			const movimientos = getStockMovementRepository();
			const nota = `Traslado de la unidad ${serial.serial_number}`;
			if (from) {
				await movimientos.create(ctx, {
					item_id: serial.item_id,
					movement_type: 'salida',
					quantity: -1,
					warehouse_id: from,
					user_id: event.locals.user?.id ?? null,
					notes: nota
				});
			}
			await movimientos.create(ctx, {
				item_id: serial.item_id,
				movement_type: 'entrada',
				quantity: 1,
				warehouse_id: warehouseId,
				user_id: event.locals.user?.id ?? null,
				notes: nota
			});

			await recordAuditLog(event, {
				action: 'inventory.serial_moved',
				entity_type: 'inventory',
				entity_id: String(serial.item_id),
				description: `Unidad ${serial.serial_number} trasladada de almacén`,
				metadata: { serialId, from, to: warehouseId }
			});

			return { scope: 'seriales', success: true };
		} catch (err) {
			return fail(400, {
				scope: 'seriales',
				error: err instanceof Error ? err.message : 'No se pudo mover la unidad.'
			});
		}
	},

	/** Traslada existencias de un almacén a otro, en una sola transacción. */
	transferStock: async (event) => {
		const { companyId } = requirePermission(event.locals, 'inventory.update');
		const ctx = toTenantContext(companyId);
		const form = await event.request.formData();

		const fromWarehouseId = String(form.get('from_warehouse_id') ?? '').trim();
		const toWarehouseId = String(form.get('to_warehouse_id') ?? '').trim();
		const quantity = Number(form.get('quantity') ?? 0);
		if (!fromWarehouseId || !toWarehouseId) {
			return fail(400, { scope: 'almacenes', error: 'Elija el almacén de origen y el de destino.' });
		}
		if (!Number.isFinite(quantity) || quantity <= 0) {
			return fail(400, { scope: 'almacenes', error: 'La cantidad debe ser mayor que cero.' });
		}

		try {
			await getInventoryRepository().transferStock(ctx, {
				item_id: event.params.id,
				from_warehouse_id: fromWarehouseId,
				to_warehouse_id: toWarehouseId,
				quantity,
				user_id: event.locals.user?.id ?? null
			});

			await recordAuditLog(event, {
				action: 'inventory.stock_transferred',
				entity_type: 'inventory',
				entity_id: String(event.params.id),
				description: `Traslado de ${quantity} entre almacenes`,
				metadata: { quantity, fromWarehouseId, toWarehouseId }
			});

			return { scope: 'almacenes', success: true };
		} catch (err) {
			return fail(400, {
				scope: 'almacenes',
				error: err instanceof Error ? err.message : 'No se pudo trasladar el stock.'
			});
		}
	},

	/** Quita al artículo de un almacén sin existencias. */
	removeFromWarehouse: async (event) => {
		const { companyId } = requirePermission(event.locals, 'inventory.update');
		const ctx = toTenantContext(companyId);
		const form = await event.request.formData();

		const warehouseId = String(form.get('warehouse_id') ?? '').trim();
		if (!warehouseId) return fail(400, { scope: 'almacenes', error: 'Falta el almacén.' });

		try {
			await getInventoryRepository().removeFromWarehouse(ctx, event.params.id, warehouseId);

			await recordAuditLog(event, {
				action: 'inventory.warehouse_removed',
				entity_type: 'inventory',
				entity_id: String(event.params.id),
				description: 'Artículo quitado de un almacén sin existencias',
				metadata: { warehouseId }
			});

			return { scope: 'almacenes', success: true };
		} catch (err) {
			return fail(400, {
				scope: 'almacenes',
				error: err instanceof Error ? err.message : 'No se pudo quitar el almacén.'
			});
		}
	},

	/** Agrega un proveedor a la lista del artículo. */
	addSupplier: async (event) => {
		const { companyId } = requirePermission(event.locals, 'inventory.update');
		const ctx = toTenantContext(companyId);
		const form = await event.request.formData();

		const supplierId = String(form.get('supplier_id') ?? '').trim();
		const isPrimary = form.get('is_primary') === '1';
		if (!supplierId) return fail(400, { scope: 'proveedores', error: 'Elija el proveedor.' });

		await getInventoryRepository().addSupplier(ctx, event.params.id, supplierId, isPrimary);

		await recordAuditLog(event, {
			action: 'inventory.supplier_added',
			entity_type: 'inventory',
			entity_id: String(event.params.id),
			description: 'Proveedor agregado al artículo',
			metadata: { supplierId, isPrimary }
		});

		return { scope: 'proveedores', success: true };
	},

	/** Marca un proveedor como el preferido de ESTE artículo. */
	setPrimarySupplier: async (event) => {
		const { companyId } = requirePermission(event.locals, 'inventory.update');
		const ctx = toTenantContext(companyId);
		const form = await event.request.formData();

		const supplierId = String(form.get('supplier_id') ?? '').trim();
		if (!supplierId) return fail(400, { scope: 'proveedores', error: 'Falta el proveedor.' });

		try {
			await getInventoryRepository().setPrimarySupplier(ctx, event.params.id, supplierId);
			return { scope: 'proveedores', success: true };
		} catch (err) {
			return fail(400, {
				scope: 'proveedores',
				error: err instanceof Error ? err.message : 'No se pudo marcar como principal.'
			});
		}
	},

	/** Quita un proveedor de la lista del artículo. */
	removeSupplier: async (event) => {
		const { companyId } = requirePermission(event.locals, 'inventory.update');
		const ctx = toTenantContext(companyId);
		const form = await event.request.formData();

		const supplierId = String(form.get('supplier_id') ?? '').trim();
		if (!supplierId) return fail(400, { scope: 'proveedores', error: 'Falta el proveedor.' });

		await getInventoryRepository().removeSupplier(ctx, event.params.id, supplierId);

		await recordAuditLog(event, {
			action: 'inventory.supplier_removed',
			entity_type: 'inventory',
			entity_id: String(event.params.id),
			description: 'Proveedor quitado del artículo',
			metadata: { supplierId }
		});

		return { scope: 'proveedores', success: true };
	},

	update: async ({ request, locals, params, getClientAddress }) => {
		const { companyId, role } = requirePermission(locals, 'inventory.update');
		const ctx = toTenantContext(companyId);
		const form = await request.formData();

		const values = {
			name: String(form.get('name') ?? '').trim(),
			internal_code: String(form.get('internal_code') ?? '').trim(),
			category_id: String(form.get('category_id') ?? '').trim(),
			subcategory_id: String(form.get('subcategory_id') ?? '').trim(),
			notes: String(form.get('notes') ?? '').trim(),
			// Las dos TARIFAS VIGENTES. Son valores por defecto: cada transacción
			// copia el que necesita cuando se hace, así que cambiarlos aquí no
			// reescribe ni una cotización emitida ni lo que costó una compra.
			rental_price: Number(form.get('rental_price') ?? 0),
			internal_cost: Number(form.get('internal_cost') ?? 0),
			uom_id: String(form.get('uom_id') ?? '').trim()
		};

		const validationErrors = validateCloudInventoryInput(values);
		if (validationErrors.length) {
			return fail(400, {
				scope: 'articulo',
				error: firstFormError(validationErrors),
				fieldErrors: formErrorsToObject(validationErrors)
			});
		}

		const current = await getInventoryRepository().findById(ctx, params.id);
		if (!current) error(404, 'Artículo no encontrado');

		// Pasar a serializado no se puede deshacer a la ligera: si ya hay
		// unidades registradas, volver a «por cantidad» las dejaría huérfanas.
		const wantsSerial = String(form.get('item_type') ?? 'cantidad') === 'serializado';

		/*
		 * El estado NO viaja gratis dentro de esta action.
		 *
		 * Antes vivía en `?/setState`, protegido con `inventory.archive`. Al
		 * mudarlo al formulario principal, que exige `inventory.update`, un rol
		 * con permiso de editar y sin permiso de archivar podría archivar
		 * artículos. Ocultar el select en la página no es un control: se lee
		 * solo si el llamante puede, y si no, se ignora. Calcado de
		 * `customers/[id=entero]/+page.server.ts`.
		 */
		const puedeArchivar = can(role, 'inventory.archive');
		const estadoPedido = Number(form.get('is_active'));
		const nextState =
			puedeArchivar && isRecordState(estadoPedido) ? estadoPedido : current.is_active;

		// NO se toca ni una existencia. Guardar la ficha de un artículo no puede
		// mover stock: para eso está el movimiento de Inventario, que además deja
		// constancia de cuándo, a qué almacén, a qué costo y quién lo hizo.
		//
		// Sin `description` ni `supplier_id`: `description` se eliminó por
		// duplicar `notes`; `supplier_id` quedó superado por la tabla de
		// proveedores múltiples. Al no venir la clave, `update()` conserva lo
		// que la fila ya tuviera ahí en vez de vaciarlo.
		await getInventoryRepository().update(ctx, params.id, {
			item_type: wantsSerial ? 'serializado' : 'cantidad',
			uses_serial: wantsSerial ? 1 : 0,
			name: values.name,
			internal_code: values.internal_code || undefined,
			category_id: values.category_id || '',
			subcategory_id: values.subcategory_id || undefined,
			notes: values.notes || undefined,
			rental_price: values.rental_price,
			internal_cost: values.internal_cost,
			uom_id: values.uom_id || null,
			is_active: nextState
		});

		if (nextState !== current.is_active) {
			await recordAuditLog({ locals, request, getClientAddress }, {
				action: 'record.state_changed',
				entity_type: 'inventory_item',
				entity_id: String(params.id),
				description: `Artículo «${values.name}» → estado ${nextState}`
			});
		}

		await recordAuditLog({ locals, request, getClientAddress }, {
			action: 'inventory.updated',
			entity_type: 'inventory',
			entity_id: String(params.id),
			description: `Artículo actualizado: ${values.name}`
		});

		return { scope: 'articulo', success: true };
	}
};
