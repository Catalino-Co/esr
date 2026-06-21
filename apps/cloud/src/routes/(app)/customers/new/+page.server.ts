import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { getCustomerRepository } from '$lib/server/repositories';
import { requireCompany } from '$lib/server/require-auth';
import { toTenantContext } from '$lib/server/tenant';
import { firstFormError, formErrorsToObject, validateCloudCustomerInput } from '$lib/server/validators';

export const load: PageServerLoad = async () => ({});

export const actions: Actions = {
	default: async ({ request, locals }) => {
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

		const errors = validateCloudCustomerInput(values);
		if (errors.length) {
			return fail(400, { error: firstFormError(errors), fieldErrors: formErrorsToObject(errors), values });
		}

		const customer = await getCustomerRepository().create(toTenantContext(companyId), {
			...values,
			is_active: 1
		});

		throw redirect(303, `/customers/${customer.id}`);
	}
};
