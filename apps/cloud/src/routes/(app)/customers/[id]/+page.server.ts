import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { getCustomerRepository } from '$lib/server/repositories';
import { recordAuditLog } from '$lib/server/audit';
import { requireCompany } from '$lib/server/require-auth';
import { toTenantContext } from '$lib/server/tenant';
import { firstFormError, formErrorsToObject, validateCloudCustomerInput } from '$lib/server/validators';

export const load: PageServerLoad = async ({ locals, params }) => {
	const { companyId } = requireCompany(locals);
	const customer = await getCustomerRepository().findById(toTenantContext(companyId), params.id);
	if (!customer) error(404, 'Cliente no encontrado');
	return { customer };
};

export const actions: Actions = {
	update: async ({ request, locals, params, getClientAddress }) => {
		const { companyId } = requireCompany(locals);
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
	deactivate: async ({ locals, params, request, getClientAddress }) => {
		const { companyId } = requireCompany(locals);
		const customer = await getCustomerRepository().findById(toTenantContext(companyId), params.id);
		if (!customer) error(404, 'Cliente no encontrado');
		await getCustomerRepository().deactivate(toTenantContext(companyId), params.id);
		await recordAuditLog({ locals, request, getClientAddress }, {
			action: 'customer.deactivated',
			entity_type: 'customer',
			entity_id: String(params.id),
			description: `Cliente desactivado: ${customer.name}`
		});
		throw redirect(303, '/customers');
	}
};
