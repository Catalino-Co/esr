import { error, fail, redirect } from '@sveltejs/kit';
import { RECORD_STATE_LABELS, SELECTABLE_STATES, isRecordState } from '@esr/core';
import type { Actions, PageServerLoad } from './$types';
import { getCustomerRepository, getEventRepository, getQuoteRepository } from '$lib/server/repositories';
import { recordAuditLog } from '$lib/server/audit';
import { requirePermission } from '$lib/server/permissions';
import { toTenantContext } from '$lib/server/tenant';
import { firstFormError, formErrorsToObject, validateCloudEventInput } from '$lib/server/validators';

export const load: PageServerLoad = async ({ locals, params }) => {
	const { companyId } = requirePermission(locals, 'events.view');
	const ctx = toTenantContext(companyId);
	const event = await getEventRepository().findById(ctx, params.id);
	if (!event) error(404, 'Evento no encontrado');

	const customers = await getCustomerRepository().list(ctx, { state: SELECTABLE_STATES, limit: 500, offset: 0 });
	const client = event.client_id
		? await getCustomerRepository().findById(ctx, event.client_id)
		: null;
	const quotes = await getQuoteRepository().findByEventId(ctx, params.id);

	return { event, customers, client, quotes };
};

async function validateClientInCompany(
	companyId: string,
	clientId: string | number | null | undefined
): Promise<string | null> {
	if (clientId == null || clientId === '') return null;
	const customer = await getCustomerRepository().findById(toTenantContext(companyId), clientId);
	if (!customer) return 'El cliente seleccionado no pertenece a su empresa.';
	return null;
}

export const actions: Actions = {
	update: async ({ request, locals, params, getClientAddress }) => {
		const { companyId } = requirePermission(locals, 'events.update');
		const ctx = toTenantContext(companyId);
		const form = await request.formData();

		const values = {
			name: String(form.get('name') ?? '').trim(),
			client_id: String(form.get('client_id') ?? '').trim(),
			location: String(form.get('location') ?? '').trim(),
			date: String(form.get('date') ?? '').trim(),
			pickup_date: String(form.get('pickup_date') ?? '').trim(),
			notes: String(form.get('notes') ?? '').trim(),
			status: String(form.get('status') ?? 'tentativo').trim()
		};

		const validationErrors = validateCloudEventInput(values);
		if (validationErrors.length) {
			return fail(400, { error: firstFormError(validationErrors), fieldErrors: formErrorsToObject(validationErrors) });
		}

		const clientError = await validateClientInCompany(companyId, values.client_id);
		if (clientError) return fail(400, { error: clientError });

		const current = await getEventRepository().findById(ctx, params.id);
		if (!current) error(404, 'Evento no encontrado');

		await getEventRepository().update(ctx, params.id, {
			name: values.name,
			client_id: values.client_id || '',
			location: values.location || undefined,
			date: values.date,
			pickup_date: values.pickup_date || values.date,
			notes: values.notes || undefined,
			status: values.status
		});

		await recordAuditLog({ locals, request, getClientAddress }, {
			action: 'event.updated',
			entity_type: 'event',
			entity_id: String(params.id),
			description: `Evento actualizado: ${values.name}`
		});

		return { success: true };
	},
	cancel: async ({ locals, params, request, getClientAddress }) => {
		const { companyId } = requirePermission(locals, 'events.cancel');
		const ctx = toTenantContext(companyId);
		const event = await getEventRepository().findById(ctx, params.id);
		if (!event) error(404, 'Evento no encontrado');
		await getEventRepository().cancel(ctx, params.id);
		await recordAuditLog({ locals, request, getClientAddress }, {
			action: 'event.cancelled',
			entity_type: 'event',
			entity_id: String(params.id),
			description: `Evento cancelado: ${event.name}`
		});
		throw redirect(303, `/events/${params.id}`);
	},
	setState: async (event) => {
		const { companyId } = requirePermission(event.locals, 'events.archive');
		const ctx = toTenantContext(companyId);
		const form = await event.request.formData();

		const state = Number(form.get('state'));
		if (!isRecordState(state)) return fail(400, { error: 'Estado no válido.' });

		const record = await getEventRepository().findById(ctx, event.params.id);
		if (!record) error(404, 'Evento no encontrado');

		await getEventRepository().setState(ctx, event.params.id, state);

		await recordAuditLog(event, {
			action: 'record.state_changed',
			entity_type: 'event',
			entity_id: String(event.params.id),
			description: `Evento «${record.name}» → ${RECORD_STATE_LABELS[state]}`
		});

		return { success: `«${record.name}» ahora está ${RECORD_STATE_LABELS[state].toLowerCase()}.` };
	}
};
