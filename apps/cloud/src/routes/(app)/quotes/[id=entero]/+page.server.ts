import { error, fail, isRedirect, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { validateAddQuoteItemInput } from '@esr/schemas';
import { SELECTABLE_STATES, validateQuoteCanApprove, validateQuoteCanEdit } from '@esr/core';
import {
	getCompanySettingsRepository,
	getCustomerRepository,
	getEventRepository,
	getInventoryRepository,
	getPackageRepository,
	getQuoteConversionService,
	getQuoteCopyService,
	getQuoteRepository,
	getRentalRepository
} from '$lib/server/repositories';
import { recordAuditLog } from '$lib/server/audit';
import { requirePermission } from '$lib/server/permissions';
import { toTenantContext } from '$lib/server/tenant';

export const load: PageServerLoad = async ({ locals, params }) => {
	const { companyId } = requirePermission(locals, 'quotes.view');
	const ctx = toTenantContext(companyId);

	// Aqui habia una guarda `/^\d+$/` sobre `params.id`. Se fue al router: la
	// ruta es `[id=entero]` y el matcher de `src/params/entero.js` rechaza lo que
	// no sea numerico antes de resolverla, asi que a este `load` —y a las actions
	// de abajo, que no pasaban por la guarda por ser POST— ya no llega basura.
	const quote = await getQuoteRepository().findById(ctx, params.id);
	if (!quote) error(404, 'Cotización no encontrada');

	// `customers` y `events` alimentan el diálogo de copiar: el destino puede
	// ser otro cliente, así que hace falta el directorio entero, no solo el
	// cliente de esta cotización.
	const TOPE_INVENTARIO = 500;

	const [
		items,
		event,
		customer,
		inventory,
		linkedOrder,
		packages,
		packageLines,
		customers,
		events,
		companySettings
	] = await Promise.all([
			getQuoteRepository().listItems(ctx, params.id),
			quote.event_id ? getEventRepository().findById(ctx, quote.event_id) : Promise.resolve(null),
			getCustomerRepository().findById(ctx, quote.client_id),
			getInventoryRepository().list(ctx, { state: SELECTABLE_STATES, limit: TOPE_INVENTARIO, offset: 0 }),
			getRentalRepository().findByQuotationId(ctx, params.id),
			getPackageRepository().list(ctx),
			getPackageRepository().listAllItems(ctx),
			getCustomerRepository().list(ctx, { state: SELECTABLE_STATES, limit: 200, offset: 0 }),
			getEventRepository().list(ctx, { limit: 200, offset: 0 }),
			// La tasa que se propone en cada linea nueva. Va en el mismo
			// `Promise.all` y no en una consulta aparte: es una fila por id.
			getCompanySettingsRepository().get(ctx)
		]);

	// Las lineas de todos los paquetes, agrupadas por paquete. Se agrupa aqui y
	// no en el cliente para no mandar una lista plana que el navegador tenga
	// que recorrer en cada cambio del desplegable.
	const lineasPorPaquete: Record<string, unknown[]> = {};
	for (const linea of packageLines) {
		const clave = String(linea.package_id);
		(lineasPorPaquete[clave] ??= []).push({
			item_id: linea.item_id,
			name: linea.name,
			code: linea.internal_code,
			quantity: Number(linea.quantity) || 0,
			// `NUMERIC` llega como cadena; se normaliza en el servidor para que
			// el cliente no tenga que acordarse.
			price: Number(linea.rental_price) || 0,
			is_active: Number(linea.is_active)
		});
	}

	return {
		quote,
		items,
		event,
		customer,
		// Proyeccion, no la fila entera: `list()` devuelve `i.*` mas las
		// columnas de disponibilidad, y el dialogo usa cinco campos. Mandar 500
		// filas completas era la mitad del peso de la pagina.
		inventory: inventory.map((articulo) => ({
			id: articulo.id,
			name: articulo.name,
			code: articulo.internal_code ?? null,
			price: Number(articulo.rental_price ?? 0),
			available: Number(articulo.available_quantity ?? 0)
		})),
		// Si el catalogo llega al tope, el dialogo lo dice: sin esto, un
		// articulo que no aparece parece un fallo de busqueda.
		inventoryTruncado: inventory.length >= TOPE_INVENTARIO,
		linkedOrder,
		packages,
		packageLines: lineasPorPaquete,
		customers,
		events,
		// El estado de cuenta ya no vive aqui: el dinero esta en el conduce, que
		// es el documento que se cobra.
		// Configuracion › Generales. Se PROPONE en la linea nueva; cambiar el
		// ajuste no toca ninguna cotizacion ya hecha.
		defaultTaxRate: Number(companySettings?.default_tax_rate ?? 0),
		canEdit: quote.status !== 'convertida' && quote.status !== 'cancelada'
	};
};

/**
 * Lee las dos tasas de una linea del formulario.
 *
 * Son PORCENTAJES, no importes, y se acotan a [0, 100]: un descuento del 150%
 * pondria el importe en negativo y una tasa negativa devolveria dinero. El
 * `<input type="number" min max>` ya lo impide en el navegador, pero una action
 * es un endpoint publico y ahi no hay navegador que valga.
 */
function leerTasas(form: FormData): { discount_rate: number; tax_rate: number } {
	const acotar = (valor: FormDataEntryValue | null) =>
		Math.min(100, Math.max(0, Number(valor ?? 0) || 0));
	return {
		discount_rate: acotar(form.get('discount_rate')),
		tax_rate: acotar(form.get('tax_rate'))
	};
}

export const actions: Actions = {
	addItem: async ({ request, locals, params }) => {
		const { companyId } = requirePermission(locals, 'quotes.update');
		const ctx = toTenantContext(companyId);
		const quote = await getQuoteRepository().findById(ctx, params.id);
		if (!quote) error(404, 'Cotización no encontrada');
		const editCheck = validateQuoteCanEdit(quote);
		if (!editCheck.ok) return fail(400, { error: editCheck.error });

		const form = await request.formData();
		const item_id = String(form.get('item_id') ?? '').trim();
		const quantity = Number(form.get('quantity') ?? 1);
		const price = Number(form.get('price') ?? 0);

		const validation = validateAddQuoteItemInput({ item_id, quantity, price });
		if (!validation.valid) return fail(400, { error: 'Artículo, cantidad y precio inválidos.' });

		await getQuoteRepository().addItem(ctx, params.id, {
			item_id,
			quantity,
			price,
			...leerTasas(form)
		});
		return { success: true };
	},
	addPackage: async (event) => {
		const { companyId } = requirePermission(event.locals, 'quotes.update');
		const ctx = toTenantContext(companyId);
		const quote = await getQuoteRepository().findById(ctx, event.params.id);
		if (!quote) error(404, 'Cotización no encontrada');
		const editCheck = validateQuoteCanEdit(quote);
		if (!editCheck.ok) return fail(400, { error: editCheck.error });

		const form = await event.request.formData();
		const packageId = String(form.get('package_id') ?? '').trim();
		if (!packageId) return fail(400, { error: 'Seleccione un paquete.' });

		const pkg = await getPackageRepository().findById(ctx, packageId);
		if (!pkg) return fail(404, { error: 'Paquete no encontrado.' });

		// Las tasas se eligen UNA vez para todo el paquete y se aplican a cada
		// linea que sale de el. Ponerlas por articulo dentro del dialogo seria
		// pedirle al usuario que rellene una tabla antes de insertar nada; una
		// vez insertadas se corrigen linea a linea como cualquier otra.
		const tasas = leerTasas(form);

		const lines = await getPackageRepository().listItems(ctx, packageId);
		if (!lines.length) {
			return fail(400, { error: `El paquete «${pkg.name}» está vacío.` });
		}

		// Se explota en líneas sueltas con el precio VIGENTE de cada artículo,
		// no con el precio sugerido del paquete: así un cambio de tarifa no
		// queda congelado en un paquete definido hace meses. Una vez insertadas,
		// las líneas se editan como cualquier otra.
		for (const line of lines) {
			await getQuoteRepository().addItem(ctx, event.params.id, {
				item_id: line.item_id,
				quantity: Number(line.quantity) || 1,
				price: Number(line.rental_price) || 0,
				...tasas
			});
		}

		await recordAuditLog(event, {
			action: 'quote.package_added',
			entity_type: 'quote',
			entity_id: String(event.params.id),
			description: `Paquete «${pkg.name}» insertado en la cotización`,
			metadata: { packageId, lineas: lines.length }
		});

		return { success: `Paquete «${pkg.name}» insertado: ${lines.length} línea(s).` };
	},

	updateItem: async ({ request, locals, params }) => {
		const { companyId } = requirePermission(locals, 'quotes.update');
		const ctx = toTenantContext(companyId);
		const quote = await getQuoteRepository().findById(ctx, params.id);
		if (!quote) error(404, 'Cotización no encontrada');
		const editCheck = validateQuoteCanEdit(quote);
		if (!editCheck.ok) return fail(400, { error: editCheck.error });

		const form = await request.formData();
		const itemId = String(form.get('itemId') ?? '').trim();
		const quantity = Number(form.get('quantity') ?? 1);
		const price = Number(form.get('price') ?? 0);
		if (!itemId || quantity <= 0 || price < 0) return fail(400, { error: 'Datos de línea inválidos.' });

		await getQuoteRepository().updateItem(ctx, params.id, itemId, {
			quantity,
			price,
			...leerTasas(form)
		});
		return { success: true };
	},
	removeItem: async ({ request, locals, params }) => {
		const { companyId } = requirePermission(locals, 'quotes.update');
		const ctx = toTenantContext(companyId);
		const quote = await getQuoteRepository().findById(ctx, params.id);
		if (!quote) error(404, 'Cotización no encontrada');
		const editCheck = validateQuoteCanEdit(quote);
		if (!editCheck.ok) return fail(400, { error: editCheck.error });

		const form = await request.formData();
		const itemId = String(form.get('itemId') ?? '').trim();
		if (!itemId) return fail(400, { error: 'Línea no especificada.' });
		await getQuoteRepository().removeItem(ctx, params.id, itemId);
		return { success: true };
	},
	updateQuote: async ({ request, locals, params }) => {
		const { companyId } = requirePermission(locals, 'quotes.update');
		const ctx = toTenantContext(companyId);
		const quote = await getQuoteRepository().findById(ctx, params.id);
		if (!quote) error(404, 'Cotización no encontrada');
		const editCheck = validateQuoteCanEdit(quote);
		if (!editCheck.ok) return fail(400, { error: editCheck.error });

		const form = await request.formData();
		// Solo los dos textos. `discount` y `tax_amount` dejaron de ser dato de
		// entrada: ahora salen de las tasas de cada linea y los escribe
		// `syncTotals`. Si esta action siguiera aceptandolos, un POST a mano
		// podria fijar un impuesto que no sale de ninguna linea.
		const notes = String(form.get('notes') ?? '').trim();
		const conditions = String(form.get('conditions') ?? '').trim();

		await getQuoteRepository().update(ctx, params.id, { notes, conditions });
		await getQuoteRepository().syncTotals(ctx, params.id);
		return { success: true };
	},
	approve: async ({ locals, params, request, getClientAddress }) => {
		const { companyId } = requirePermission(locals, 'quotes.approve');
		const ctx = toTenantContext(companyId);
		const quote = await getQuoteRepository().findById(ctx, params.id);
		if (!quote) error(404, 'Cotización no encontrada');
		const items = await getQuoteRepository().listItems(ctx, params.id);
		const approval = validateQuoteCanApprove(quote, items);
		if (!approval.ok) return fail(400, { error: approval.error });

		for (const item of items) {
			if (!item.item_id) continue;
			// `getInventoryRepository`, NO `getQuoteRepository`: `checkAvailability`
			// vive en el repositorio de inventario y nunca ha existido en el de
			// cotizaciones. Aprobar cualquier cotizacion con una linea de articulo
			// lanzaba `TypeError` y devolvia un 500; solo se salvaba si todas las
			// lineas eran de paquete, porque el `continue` de arriba las salta.
			const check = await getInventoryRepository().checkAvailability(
				ctx,
				item.item_id,
				Number(item.quantity || 0),
				item.start_date || quote.date || undefined,
				item.end_date || undefined
			);
			if (!check.ok) {
				return fail(400, {
					error: `Disponibilidad insuficiente para ${item.name}: necesita ${item.quantity}, disponible ${check.available}.`
				});
			}
		}

		await getQuoteRepository().changeStatus(ctx, params.id, 'aprobada');
		await recordAuditLog({ locals, request, getClientAddress }, {
			action: 'quote.approved',
			entity_type: 'quote',
			entity_id: String(params.id),
			description: `Cotización aprobada ${quote.quote_number || params.id}`,
			metadata: { quoteNumber: quote.quote_number }
		});
		return { success: true };
	},
	cancel: async ({ locals, params, request, getClientAddress }) => {
		const { companyId } = requirePermission(locals, 'quotes.cancel');
		const ctx = toTenantContext(companyId);
		const quote = await getQuoteRepository().findById(ctx, params.id);
		if (!quote) error(404, 'Cotización no encontrada');
		if (quote.status === 'convertida') return fail(400, { error: 'No se puede cancelar una cotización convertida.' });
		await getQuoteRepository().changeStatus(ctx, params.id, 'cancelada');
		await recordAuditLog({ locals, request, getClientAddress }, {
			action: 'quote.cancelled',
			entity_type: 'quote',
			entity_id: String(params.id),
			description: `Cotización cancelada ${quote.quote_number || params.id}`
		});
		throw redirect(303, '/quotes');
	},
	convert: async ({ locals, params, request, getClientAddress }) => {
		const { companyId } = requirePermission(locals, 'quotes.convert');
		const ctx = toTenantContext(companyId);
		try {
			const { order } = await getQuoteConversionService().convertToWorkOrder(ctx, params.id);
			await recordAuditLog({ locals, request, getClientAddress }, {
				action: 'quote.converted',
				entity_type: 'quote',
				entity_id: String(params.id),
				description: `Cotización convertida a orden ${order.order_number || order.id}`,
				metadata: { orderId: order.id }
			});
			await recordAuditLog({ locals, request, getClientAddress }, {
				action: 'order.created',
				entity_type: 'order',
				entity_id: String(order.id),
				description: `Orden creada desde cotización ${params.id}`
			});
			throw redirect(303, `/work-orders/${order.id}`);
		} catch (conversionError) {
			// `redirect()` de SvelteKit se lanza como excepcion: sin esto el catch
			// se lo tragaba y la accion respondia "no se pudo" aunque hubiera
			// funcionado. Se re-lanza para que el framework lo procese.
			if (isRedirect(conversionError)) throw conversionError;

			const message = conversionError instanceof Error ? conversionError.message : 'No se pudo convertir la cotización.';
			return fail(400, { error: message });}
	},

	/**
	 * Copiar la cotizacion, al mismo cliente o a otro.
	 *
	 * Se copia lo comercial —lineas con sus fechas, descuento, impuesto, notas y
	 * condiciones—; el ciclo de vida no: la copia nace en borrador y con numero
	 * nuevo. Por eso el permiso es `quotes.create` y no `quotes.update`: lo que
	 * sale de aqui es una cotizacion nueva, no una modificacion de esta.
	 */
	copy: async (event) => {
		const { companyId } = requirePermission(event.locals, 'quotes.create');
		const ctx = toTenantContext(companyId);
		const form = await event.request.formData();

		const client_id = String(form.get('client_id') ?? '').trim();
		const event_id = String(form.get('event_id') ?? '').trim();
		if (!client_id) return fail(400, { error: 'Elija el cliente de destino.' });

		let copia;
		try {
			copia = await getQuoteCopyService().copy(ctx, event.params.id, {
				client_id,
				event_id: event_id || null
			});
		} catch (err) {
			return fail(400, { error: (err as Error).message });
		}

		await recordAuditLog(event, {
			action: 'quote.copied',
			entity_type: 'quote',
			entity_id: String(copia.id),
			description: `Cotización ${copia.quote_number} copiada desde ${event.params.id}`,
			metadata: { origen: event.params.id, client_id, event_id: event_id || null }
		});

		redirect(303, `/quotes/${copia.id}`);
	}
};
