import { error, fail } from '@sveltejs/kit';
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
import { leerEvento, vincularDocumentos } from '../evento-form';

export const load: PageServerLoad = async ({ locals, params }) => {
	const { companyId } = requirePermission(locals, 'events.view');
	const ctx = toTenantContext(companyId);
	const event = await getEventRepository().findById(ctx, params.id);
	if (!event) error(404, 'Evento no encontrado');

	const [customers, eventTypes, quotes, orders, quotesTodas, ordersTodas] = await Promise.all([
		getCustomerRepository().list(ctx, { state: SELECTABLE_STATES, limit: 500, offset: 0 }),
		getEventTypeRepository().list(ctx, { state: SELECTABLE_STATES }),
		// El vinculo REAL: `quotations.event_id` / `work_orders.event_id`, no las
		// columnas del evento. De aqui salen las dos tarjetas de resumen.
		getQuoteRepository().findByEventId(ctx, params.id),
		getRentalRepository().findByEventId(ctx, params.id),
		getQuoteRepository().list(ctx, { limit: 200, offset: 0 }),
		getRentalRepository().list(ctx, { limit: 200, offset: 0 })
	]);

	const client = event.client_id
		? await getCustomerRepository().findById(ctx, event.client_id)
		: null;

	return {
		event,
		customers,
		eventTypes,
		client,
		quotes,
		orders,
		// Solo las huerfanas: enganchar una que ya es de otro evento seria
		// robarsela sin avisar.
		quotesLibres: quotesTodas.filter((q) => !q.event_id),
		ordersLibres: ordersTodas.filter((o) => !o.event_id)
	};
};

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

		await vincularDocumentos(ctx, event.params.id, values);

		await recordAuditLog(event, {
			action: 'event.updated',
			entity_type: 'event',
			entity_id: String(event.params.id),
			description: `Evento actualizado: ${values.name}`
		});

		return { success: true };
	}
};
