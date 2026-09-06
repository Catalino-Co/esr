import { fail, redirect } from '@sveltejs/kit';
import { SELECTABLE_STATES, parsePeriodo, periodoDeRango, rangoDelPeriodo } from '@esr/core';
import type { Actions, PageServerLoad } from './$types';
import {
	getCompanySettingsRepository,
	getCustomerRepository,
	getEventRepository,
	getEventTypeRepository
} from '$lib/server/repositories';
import { recordAuditLog } from '$lib/server/audit';
import { requirePermission } from '$lib/server/permissions';
import { toTenantContext } from '$lib/server/tenant';
import { firstFormError, formErrorsToObject, validateCloudEventInput } from '$lib/server/validators';
import { leerEvento } from './evento-form';

export const load: PageServerLoad = async ({ locals, url }) => {
	const { companyId } = requirePermission(locals, 'events.view');
	const ctx = toTenantContext(companyId);
	const search = url.searchParams.get('search')?.trim() || undefined;
	const status = url.searchParams.get('status')?.trim() || undefined;

	// `dateFrom`/`dateTo`, mismos nombres que Órdenes/Cotizaciones/Facturas.
	const desdeUrl = url.searchParams.get('dateFrom')?.trim() || '';
	const hastaUrl = url.searchParams.get('dateTo')?.trim() || '';

	const usaDefecto = !desdeUrl && !hastaUrl;
	const porDefecto = usaDefecto
		? rangoDelPeriodo(
				parsePeriodo((await getCompanySettingsRepository().get(ctx))?.default_event_range)
			)
		: null;
	const desde = porDefecto ? porDefecto.desde : desdeUrl;
	const hasta = porDefecto ? porDefecto.hasta : hastaUrl;
	const invertido = Boolean(desde && hasta && desde > hasta);

	// Sin `state`: el listado ya no ofrece el eje de circulacion, y sin el
	// `appendStateFilter` del repositorio cae en `DEFAULT_RECORD_STATE`, que es
	// «activos». Un evento se retira CANCELANDOLO, que es su estado de negocio.
	//
	// Dos consultas, no una: la Tabla respeta el rango de fechas nuevo; el
	// Calendario NO —pagina de mes en mes en memoria y perdería un mes entero
	// si solo viera lo que la Tabla tiene cargado—, asi que sigue trayendo
	// exactamente lo que esta pantalla ya traia antes de este cambio.
	const [eventsTabla, eventsCalendario, customers, eventTypes] = await Promise.all([
		getEventRepository().list(ctx, {
			search,
			status,
			date_from: desde || undefined,
			date_to: hasta || undefined,
			limit: 101,
			offset: 0
		}),
		getEventRepository().list(ctx, { search, status, limit: 100, offset: 0 }),
		getCustomerRepository().list(ctx, { state: SELECTABLE_STATES, limit: 500, offset: 0 }),
		getEventTypeRepository().list(ctx, { state: SELECTABLE_STATES })
	]);

	const customerMap = new Map(customers.map((customer) => [customer.id, customer.name]));
	const conNombre = (event: (typeof eventsTabla)[number]) => ({
		...event,
		client_name: event.client_id ? (customerMap.get(event.client_id) ?? '—') : '—'
	});

	const hayMas = eventsTabla.length > 100;

	// Aqui se traian 400 filas —200 cotizaciones y 200 ordenes— para alimentar
	// los dos desplegables del dialogo de alta. Se fueron con ellos: vincular
	// pasa a hacerse desde la ficha, a la que el alta redirige.
	return {
		events: eventsTabla.slice(0, 100).map(conNombre),
		eventsCalendario: eventsCalendario.map(conNombre),
		customers,
		eventTypes,
		search: search ?? '',
		status: status ?? '',
		dateFrom: desde,
		dateTo: hasta,
		rangoActivo: periodoDeRango(desde, hasta),
		invertido,
		hayMas
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

		await recordAuditLog(event, {
			action: 'event.created',
			entity_type: 'event',
			entity_id: String(created.id),
			description: `Evento creado: ${created.name}`
		});

		throw redirect(303, `/events/${created.id}`);
	}
};
