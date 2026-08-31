import { fail, redirect } from '@sveltejs/kit';
import { SELECTABLE_STATES } from '@esr/core';
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
import { leerEvento, vincularDocumentos } from './evento-form';

export const load: PageServerLoad = async ({ locals, url }) => {
	const { companyId } = requirePermission(locals, 'events.view');
	const ctx = toTenantContext(companyId);
	const search = url.searchParams.get('search')?.trim() || undefined;
	const status = url.searchParams.get('status')?.trim() || undefined;

	// Sin `state`: el listado ya no ofrece el eje de circulacion, y sin el
	// `appendStateFilter` del repositorio cae en `DEFAULT_RECORD_STATE`, que es
	// «activos». Un evento se retira CANCELANDOLO, que es su estado de negocio.
	const [events, customers, eventTypes] = await Promise.all([
		getEventRepository().list(ctx, { search, status, limit: 100, offset: 0 }),
		getCustomerRepository().list(ctx, { state: SELECTABLE_STATES, limit: 500, offset: 0 }),
		getEventTypeRepository().list(ctx, { state: SELECTABLE_STATES })
	]);

	const customerMap = new Map(customers.map((customer) => [customer.id, customer.name]));

	// Las cotizaciones y ordenes SIN evento, mas nada. Son las unicas que el
	// dialogo puede enganchar sin robarselas a otro evento.
	const [quotesLibres, ordersLibres] = await Promise.all([
		getQuoteRepository().list(ctx, { limit: 200, offset: 0 }),
		getRentalRepository().list(ctx, { limit: 200, offset: 0 })
	]);

	return {
		events: events.map((event) => ({
			...event,
			client_name: event.client_id ? customerMap.get(event.client_id) ?? '—' : '—'
		})),
		customers,
		eventTypes,
		quotes: quotesLibres.filter((q) => !q.event_id),
		orders: ordersLibres.filter((o) => !o.event_id),
		search: search ?? '',
		status: status ?? ''
	};
};

export const actions: Actions = {
	/**
	 * Alta de evento, desde el dialogo de esta misma pantalla.
	 *
	 * Era la action `default` de `/events/new`, que ya no existe. Gana los siete
	 * campos que Cloud nunca saco a pantalla aunque las columnas llevaban ahi
	 * desde la migracion 001.
	 */
	create: async (event) => {
		const { companyId } = requirePermission(event.locals, 'events.create');
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

		const created = await getEventRepository().create(ctx, {
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
			status: values.status,
			is_active: 1
		});

		// El vinculo se escribe en la COTIZACION y en la ORDEN, no en el evento:
		// `quotations.event_id` es el que Cloud rellena siempre y el que leen las
		// tarjetas de resumen. Ver `evento-form.ts`.
		await vincularDocumentos(ctx, created.id!, values);

		await recordAuditLog(event, {
			action: 'event.created',
			entity_type: 'event',
			entity_id: String(created.id),
			description: `Evento creado: ${created.name}`
		});

		throw redirect(303, `/events/${created.id}`);
	}
};
