import { fail, redirect } from '@sveltejs/kit';
import { RECORD_STATE, SELECTABLE_STATES, todayISO } from '@esr/core';
import type { Actions, PageServerLoad } from './$types';
import { recordAuditLog } from '$lib/server/audit';
import { requirePermission } from '$lib/server/permissions';
import {
	getCategoryRepository,
	getCustomerRepository,
	getEventRepository,
	getInventoryRepository,
	getServiceRepository,
	getWorkOrderCreationService
} from '$lib/server/repositories';
import { toTenantContext } from '$lib/server/tenant';

/**
 * Orden SIN cotizacion.
 *
 * A diferencia de la cotizacion, que nace vacia y se le añaden lineas despues,
 * la orden se crea entera de una vez. No es capricho: `work_orders` no tiene
 * estado borrador, la orden nace CONFIRMADA y aparta stock desde ese momento.
 * Una orden vacia y confirmada seria una orden que no se puede preparar y que
 * no reserva nada.
 *
 * Si la orden viene de una cotizacion aprobada, el camino NO es este: es el
 * boton «Convertir en orden» de la ficha de la cotizacion, que copia sus lineas
 * y deja las dos enlazadas. Por eso aqui no hay un «importar cotizacion» como
 * el de ESR Pro, que en Cloud seria un segundo camino compitiendo con aquel.
 */
export const load: PageServerLoad = async ({ locals, url }) => {
	const { companyId } = requirePermission(locals, 'work_orders.create');
	const ctx = toTenantContext(companyId);

	const [customers, events, inventory, categories, services] = await Promise.all([
		getCustomerRepository().list(ctx, { state: SELECTABLE_STATES, limit: 200, offset: 0 }),
		getEventRepository().list(ctx, { limit: 200, offset: 0 }),
		// Solo Activos: un inactivo/archivado no se puede usar en una orden
		// nueva (a diferencia de clientes/categorías, que sí siguen ofreciendo
		// Inactivo — `SELECTABLE_STATES` es de ellos).
		getInventoryRepository().list(ctx, { state: RECORD_STATE.ACTIVE, limit: 300, offset: 0 }),
		// Los catalogos no paginan: `CatalogListOptions` solo acepta el estado.
		getCategoryRepository().list(ctx, { state: SELECTABLE_STATES }),
		getServiceRepository().list(ctx, { state: RECORD_STATE.ACTIVE })
	]);

	// El catalogo del editor solo necesita esto. Proyectar en vez de mandar la
	// fila entera evita que el precio de coste (`internal_cost`) viaje al
	// navegador en una pantalla que no lo usa.
	const nombreCategoria = new Map(categories.map((c) => [String(c.id), c.name]));
	const catalogo = inventory.map((item) => ({
		id: item.id,
		internal_code: item.internal_code ?? '',
		name: item.name,
		item_type: item.item_type,
		rental_price: item.rental_price ?? 0,
		available_quantity: item.available_quantity ?? 0,
		tracks_inventory: item.tracks_inventory ?? true,
		categoria: item.category_id ? nombreCategoria.get(String(item.category_id)) ?? '' : ''
	}));

	return {
		customers,
		events,
		catalogo,
		services,
		clientId: url.searchParams.get('client')?.trim() || '',
		hoy: todayISO()
	};
};

export const actions: Actions = {
	default: async (event) => {
		const { companyId } = requirePermission(event.locals, 'work_orders.create');
		const ctx = toTenantContext(companyId);
		const form = await event.request.formData();

		// Las lineas viajan como tres arrays paralelos. Se emparejan por indice,
		// asi que un descuadre entre ellos es un formulario manipulado.
		const itemIds = form.getAll('line_item_id').map((v) => String(v).trim());
		const cantidades = form.getAll('line_quantity').map((v) => String(v).trim());
		const precios = form.getAll('line_price').map((v) => String(v).trim());

		const lines = itemIds
			.map((item_id, indice) => ({
				item_id,
				quantity: cantidades[indice],
				price: precios[indice]
			}))
			.filter((linea) => linea.item_id);

		// Mismo patron de tres arrays paralelos, para las lineas de Servicio.
		const serviceIds = form.getAll('line_service_id').map((v) => String(v).trim());
		const cantidadesServicio = form.getAll('line_service_quantity').map((v) => String(v).trim());
		const preciosServicio = form.getAll('line_service_price').map((v) => String(v).trim());

		const serviceLines = serviceIds
			.map((service_id, indice) => ({
				service_id,
				quantity: cantidadesServicio[indice],
				price: preciosServicio[indice]
			}))
			.filter((linea) => linea.service_id);

		/*
		 * `values` lleva TAMBIEN las lineas.
		 *
		 * Antes solo devolvia la cabecera, asi que el error mas frecuente de esta
		 * pantalla —no hay disponibilidad de un articulo— borraba la orden entera
		 * y habia que volver a montarla desde el catalogo. Con las lineas dentro,
		 * la pantalla se rehidrata y solo hay que corregir la que falla.
		 */
		const values = {
			client_id: String(form.get('client_id') ?? '').trim(),
			event_id: String(form.get('event_id') ?? '').trim(),
			date: String(form.get('date') ?? '').trim(),
			start_date: String(form.get('start_date') ?? '').trim(),
			end_date: String(form.get('end_date') ?? '').trim(),
			responsible_person: String(form.get('responsible_person') ?? '').trim(),
			vehicle: String(form.get('vehicle') ?? '').trim(),
			notes: String(form.get('notes') ?? '').trim(),
			lines,
			serviceLines
		};

		if (itemIds.length !== cantidades.length || itemIds.length !== precios.length) {
			return fail(400, { error: 'Las líneas llegaron incompletas.', values });
		}
		if (serviceIds.length !== cantidadesServicio.length || serviceIds.length !== preciosServicio.length) {
			return fail(400, { error: 'Las líneas de servicio llegaron incompletas.', values });
		}

		let order;
		try {
			order = await getWorkOrderCreationService().createDirect(ctx, {
				client_id: values.client_id,
				event_id: values.event_id || null,
				date: values.date || null,
				start_date: values.start_date || null,
				end_date: values.end_date || null,
				responsible_person: values.responsible_person || null,
				vehicle: values.vehicle || null,
				notes: values.notes || null,
				lines: [...lines, ...serviceLines]
			});
		} catch (err) {
			// Aqui llegan tanto las reglas de `validateDirectOrderDraft` como la
			// falta de disponibilidad, ya traducidas a español por el servicio.
			return fail(400, { error: (err as Error).message, values });
		}

		await recordAuditLog(event, {
			action: 'order.created',
			entity_type: 'order',
			entity_id: String(order.id),
			description: `Orden ${order.order_number} creada sin cotización`,
			metadata: { lineas: lines.length, servicios: serviceLines.length, total: order.total }
		});

		redirect(303, `/work-orders/${order.id}`);
	}
};
