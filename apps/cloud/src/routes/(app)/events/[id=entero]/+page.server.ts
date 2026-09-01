import { error, fail } from '@sveltejs/kit';
import { RECORD_STATE, RECORD_STATES, SELECTABLE_STATES } from '@esr/core';
import type { Actions, PageServerLoad } from './$types';
import {
	getCustomerRepository,
	getEventRepository,
	getEventTypeRepository,
	getQuoteRepository,
	getRentalRepository
} from '$lib/server/repositories';
import { recordAuditLog } from '$lib/server/audit';
import { requirePermission } from '$lib/server/permissions';
import { toTenantContext } from '$lib/server/tenant';
import { firstFormError, formErrorsToObject, validateCloudEventInput } from '$lib/server/validators';
import { leerEvento } from '../evento-form';

/** Los dos diálogos de vínculo, gobernados por `?vincular=`. */
const VINCULABLES = ['cotizacion', 'orden'] as const;

/**
 * Tope del SELECTOR, no del dato.
 *
 * Con `without_event` el universo ya es pequeño. Se pide uno de más para saber
 * si hay recorte y decirlo: el filtro en memoria que había antes recortaba a
 * 200 en silencio, y una cotización huérfana antigua no aparecía nunca.
 */
const TOPE_CANDIDATOS = 50;

export const load: PageServerLoad = async ({ locals, params, url }) => {
	const { companyId } = requirePermission(locals, 'events.view');
	const ctx = toTenantContext(companyId);
	const event = await getEventRepository().findById(ctx, params.id);
	if (!event) error(404, 'Evento no encontrado');

	const vincular = VINCULABLES.find((tipo) => tipo === url.searchParams.get('vincular')) ?? null;
	const buscarDoc = url.searchParams.get('buscarDoc')?.trim() || undefined;

	const [customers, eventTypes, quotesTodas, orders] = await Promise.all([
		getCustomerRepository().list(ctx, { state: SELECTABLE_STATES, limit: 500, offset: 0 }),
		getEventTypeRepository().list(ctx, { state: SELECTABLE_STATES }),
		/*
		 * UNA consulta con los tres estados de circulación, y el reparto en
		 * memoria. Con dos —`findByEventId` para la tarjeta y otra para contar—
		 * la N del enlace saldría corta: `findByEventId` solo ve las activas.
		 */
		getQuoteRepository().list(ctx, {
			event_id: params.id,
			state: RECORD_STATES,
			limit: 200,
			offset: 0
		}),
		getRentalRepository().findByEventId(ctx, params.id)
	]);

	// La tarjeta enseña lo VIVO: activas y no canceladas. Lo demás se llega por
	// el historial, que es lo que evita que ocultar sea esconder.
	const quotes = quotesTodas.filter(
		(quote) => quote.is_active === RECORD_STATE.ACTIVE && quote.status !== 'cancelada'
	);

	const candidatos = vincular
		? await cargarCandidatos(ctx, vincular, buscarDoc, customers)
		: null;

	return {
		event,
		customers,
		eventTypes,
		quotes,
		orders,
		/** Cuántas hay en el historial, que es a donde lleva el enlace. */
		quotesTotal: quotesTodas.length,
		vincular,
		buscarDoc: buscarDoc ?? '',
		candidatos
	};
};

/**
 * Las candidatas del diálogo: solo las que no pertenecen a ningún evento.
 *
 * Estado de circulación ACTIVO y no `SELECTABLE_STATES`: la tarjeta lateral lee
 * con el estado por defecto, así que ofrecer una inactiva la haría desaparecer
 * nada más vincularla. Un selector no debe ofrecer lo que su propio resultado
 * no va a mostrar.
 */
async function cargarCandidatos(
	ctx: ReturnType<typeof toTenantContext>,
	tipo: (typeof VINCULABLES)[number],
	search: string | undefined,
	customers: Array<{ id?: unknown; name?: string }>
) {
	const filtros = { without_event: true, search, limit: TOPE_CANDIDATOS + 1, offset: 0 };

	const filas =
		tipo === 'cotizacion'
			? /*
			   * Las CANCELADAS no se ofrecen.
			   *
			   * La tarjeta del evento las esconde, asi que vincular una seria verla
			   * desaparecer en el acto: un selector no debe ofrecer nada que su
			   * propio resultado no vaya a mostrar. Es la misma razon por la que
			   * tampoco se ofrecen las que estan fuera de circulacion.
			   *
			   * El descarte va EN MEMORIA y por eso se piden 200 y no 51:
			   * `QuoteListFilters.status` es una igualdad, y «cualquiera menos una»
			   * no cabe ahi sin inventarse un filtro para un solo llamador. La
			   * busqueda sigue haciendose en SQL, que es lo que importa.
			   */
				(await getQuoteRepository().list(ctx, { ...filtros, limit: 200 }))
					.filter((quote) => quote.status !== 'cancelada')
					.slice(0, TOPE_CANDIDATOS + 1)
					.map((quote) => ({
						id: quote.id,
						numero: quote.quote_number || `#${quote.id}`,
						client_id: quote.client_id,
						date: quote.date,
						total: quote.total,
						status: quote.status
					}))
			: (await getRentalRepository().list(ctx, filtros)).map((order) => ({
					id: order.id,
					numero: order.order_number || `WO-${String(order.id).padStart(5, '0')}`,
					client_id: order.client_id,
					date: order.date,
					total: order.total,
					status: order.status
				}));

	const hayMas = filas.length > TOPE_CANDIDATOS;
	const visibles = hayMas ? filas.slice(0, TOPE_CANDIDATOS) : filas;

	// El nombre del cliente es lo único que identifica la fila además del
	// número. Los 500 ya cargados cubren casi todo; los que falten se piden uno
	// a uno, y son como mucho cincuenta.
	const nombres = new Map(customers.map((c) => [String(c.id), c.name ?? '—']));
	const faltan = [
		...new Set(
			visibles
				.map((fila) => String(fila.client_id ?? ''))
				.filter((id) => id && !nombres.has(id))
		)
	];
	for (const id of faltan) {
		const cliente = await getCustomerRepository().findById(ctx, id);
		if (cliente) nombres.set(id, cliente.name);
	}

	return {
		tipo,
		hayMas,
		filas: visibles.map((fila) => ({
			...fila,
			client_name: nombres.get(String(fila.client_id ?? '')) ?? '—'
		}))
	};
}

export const actions: Actions = {
	update: async (event) => {
		const { companyId } = requirePermission(event.locals, 'events.update');
		const ctx = toTenantContext(companyId);
		const values = leerEvento(await event.request.formData());

		const errors = validateCloudEventInput(values);
		if (errors.length) {
			return fail(400, {
				error: firstFormError(errors),
				fieldErrors: formErrorsToObject(errors),
				values
			});
		}

		if (values.client_id) {
			const customer = await getCustomerRepository().findById(ctx, values.client_id);
			if (!customer) {
				return fail(400, { error: 'El cliente seleccionado no pertenece a su empresa.', values });
			}
		}

		const current = await getEventRepository().findById(ctx, event.params.id);
		if (!current) error(404, 'Evento no encontrado');

		await getEventRepository().update(ctx, event.params.id, {
			name: values.name,
			client_id: values.client_id || '',
			event_type: values.event_type || undefined,
			date: values.date,
			departure_time: values.departure_time || undefined,
			setup_time: values.setup_time || undefined,
			pickup_date: values.pickup_date || values.date,
			pickup_time: values.pickup_time || undefined,
			location: values.location || undefined,
			responsible_person: values.responsible_person || undefined,
			notes: values.notes || undefined,
			status: values.status
		});

		await recordAuditLog(event, {
			action: 'event.updated',
			entity_type: 'event',
			entity_id: String(event.params.id),
			description: `Evento actualizado: ${values.name}`
		});

		return { success: true };
	},

	/*
	 * ── Vincular ──────────────────────────────────────────────────────────
	 *
	 * Permiso `events.update` y SOLO ese: la operación no cambia nada del
	 * contenido de la cotización —ni dinero, ni estado, ni líneas—, cambia la
	 * composición del evento. Además es el mismo con el que se pintan los dos
	 * botones, así que interfaz y servidor no pueden discrepar.
	 *
	 * El error va en `errorVinculo`, NO en `error`: `form` es único por página y
	 * la action `update` de arriba escribe en `error`; compartir la clave haría
	 * que el fallo de un guardado se pintara dentro del diálogo.
	 */
	linkQuote: async (event) => {
		const { companyId } = requirePermission(event.locals, 'events.update');
		const ctx = toTenantContext(companyId);
		const form = await event.request.formData();
		const quoteId = String(form.get('quote_id') ?? '').trim();
		if (!quoteId) return fail(400, { errorVinculo: 'No se indicó qué cotización vincular.' });

		const evento = await getEventRepository().findById(ctx, event.params.id);
		if (!evento) error(404, 'Evento no encontrado');

		if (!(await getQuoteRepository().linkToEvent(ctx, quoteId, event.params.id))) {
			// Solo aquí se relee la fila: en el camino feliz no cuesta nada, y sin
			// esto lo único que se sabe es que no se escribió, no por qué.
			const quote = await getQuoteRepository().findById(ctx, quoteId);
			if (!quote) {
				return fail(404, { errorVinculo: 'Esa cotización ya no existe o no es de su empresa.' });
			}
			// Doble clic, o ya vinculada desde otra pestaña. No es un error.
			if (String(quote.event_id) === String(event.params.id)) return { success: true };
			if (quote.event_id) {
				return fail(409, { errorVinculo: 'Esa cotización ya pertenece a otro evento.' });
			}
			return fail(409, { errorVinculo: 'Esa cotización ya no está activa.' });
		}

		const quote = await getQuoteRepository().findById(ctx, quoteId);
		await recordAuditLog(event, {
			action: 'event.quote_linked',
			entity_type: 'event',
			entity_id: String(event.params.id),
			description: `Cotización ${quote?.quote_number || `#${quoteId}`} vinculada al evento ${evento.name}`
		});

		return { success: true };
	},

	linkOrder: async (event) => {
		const { companyId } = requirePermission(event.locals, 'events.update');
		const ctx = toTenantContext(companyId);
		const form = await event.request.formData();
		const orderId = String(form.get('order_id') ?? '').trim();
		if (!orderId) return fail(400, { errorVinculo: 'No se indicó qué orden vincular.' });

		const evento = await getEventRepository().findById(ctx, event.params.id);
		if (!evento) error(404, 'Evento no encontrado');

		if (!(await getRentalRepository().linkToEvent(ctx, orderId, event.params.id))) {
			const order = await getRentalRepository().findById(ctx, orderId);
			if (!order) {
				return fail(404, { errorVinculo: 'Esa orden ya no existe o no es de su empresa.' });
			}
			if (String(order.event_id) === String(event.params.id)) return { success: true };
			if (order.event_id) {
				return fail(409, { errorVinculo: 'Esa orden ya pertenece a otro evento.' });
			}
			return fail(409, { errorVinculo: 'Esa orden ya no está activa.' });
		}

		const order = await getRentalRepository().findById(ctx, orderId);
		await recordAuditLog(event, {
			action: 'event.order_linked',
			entity_type: 'event',
			entity_id: String(event.params.id),
			description: `Orden ${order?.order_number || `WO-${String(orderId).padStart(5, '0')}`} vinculada al evento ${evento.name}`
		});

		return { success: true };
	}
};
