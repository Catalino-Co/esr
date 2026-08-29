import { error, fail, redirect } from '@sveltejs/kit';
import { RECORD_STATE, RECORD_STATE_LABELS, isRecordState } from '@esr/core';
import type { Actions, PageServerLoad } from './$types';
import { getCustomerRepository } from '$lib/server/repositories';
import { recordAuditLog } from '$lib/server/audit';
import { requirePermission } from '$lib/server/permissions';
import { toTenantContext } from '$lib/server/tenant';
import { firstFormError, formErrorsToObject, validateCloudCustomerInput } from '$lib/server/validators';

export const load: PageServerLoad = async ({ locals, params }) => {
	const { companyId } = requirePermission(locals, 'customers.view');
	const customer = await getCustomerRepository().findById(toTenantContext(companyId), params.id);
	if (!customer) error(404, 'Cliente no encontrado');
	return { customer };
};

export const actions: Actions = {
	update: async ({ request, locals, params, getClientAddress }) => {
		const { companyId } = requirePermission(locals, 'customers.update');
		const form = await request.formData();
		const values = {
			name: String(form.get('name') ?? '').trim(),
			email: String(form.get('email') ?? '').trim(),
			phone: String(form.get('phone') ?? '').trim(),
			address: String(form.get('address') ?? '').trim(),
			contact_person: String(form.get('contact_person') ?? '').trim(),
			notes: String(form.get('notes') ?? '').trim(),
			document_id: String(form.get('document_id') ?? '').trim()
		};

		const validationErrors = validateCloudCustomerInput(values);
		if (validationErrors.length) {
			return fail(400, { error: firstFormError(validationErrors), fieldErrors: formErrorsToObject(validationErrors) });
		}

		await getCustomerRepository().update(toTenantContext(companyId), params.id, values);
		await recordAuditLog({ locals, request, getClientAddress }, {
			action: 'customer.updated',
			entity_type: 'customer',
			entity_id: String(params.id),
			description: `Cliente actualizado: ${values.name}`
		});
		return { success: true };
	},
	setState: async (event) => {
		const { companyId } = requirePermission(event.locals, 'customers.archive');
		const ctx = toTenantContext(companyId);
		const form = await event.request.formData();

		const state = Number(form.get('state'));
		if (!isRecordState(state)) return fail(400, { error: 'Estado no válido.' });

		const record = await getCustomerRepository().findById(ctx, event.params.id);
		if (!record) error(404, 'Cliente no encontrado');

		await getCustomerRepository().setState(ctx, event.params.id, state);

		await recordAuditLog(event, {
			action: 'record.state_changed',
			entity_type: 'customer',
			entity_id: String(event.params.id),
			description: `Cliente «${record.name}» → ${RECORD_STATE_LABELS[state]}`
		});

		return { success: `«${record.name}» ahora está ${RECORD_STATE_LABELS[state].toLowerCase()}.` };
	}
};
