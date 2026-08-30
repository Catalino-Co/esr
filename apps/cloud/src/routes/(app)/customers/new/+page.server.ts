import { fail, redirect } from '@sveltejs/kit';
import { SELECTABLE_STATES, parseDocumentType, parsePaymentTerms } from '@esr/core';
import type { Actions, PageServerLoad } from './$types';
import { getCommercialSectorRepository, getCustomerRepository } from '$lib/server/repositories';
import { text } from '$lib/server/catalogs';
import { recordAuditLog } from '$lib/server/audit';
import { requirePermission } from '$lib/server/permissions';
import { toTenantContext } from '$lib/server/tenant';
import { firstFormError, formErrorsToObject, validateCloudCustomerInput } from '$lib/server/validators';

export const load: PageServerLoad = async ({ locals }) => {
	const { companyId } = requirePermission(locals, 'customers.create');
	const sectors = await getCommercialSectorRepository().list(toTenantContext(companyId), {
		state: SELECTABLE_STATES
	});
	return { sectors };
};

export const actions: Actions = {
	default: async (event) => {
		const { companyId } = requirePermission(event.locals, 'customers.create');
		const ctx = toTenantContext(companyId);
		const form = await event.request.formData();

		// El sector se re-lee contra la empresa: el repositorio filtra por
		// company_id, asi que un id ajeno colado a mano vuelve null y se
		// descarta en vez de colgar el cliente de otra empresa.
		const sectorRaw = text(form, 'sector_id');
		const sector = sectorRaw ? await getCommercialSectorRepository().findById(ctx, sectorRaw) : null;

		const values = {
			name: text(form, 'name'),
			email: text(form, 'email'),
			phone: text(form, 'phone'),
			address: text(form, 'address'),
			contact_person: text(form, 'contact_person'),
			notes: text(form, 'notes'),
			document_id: text(form, 'document_id'),
			document_type: parseDocumentType(form.get('document_type')),
			payment_terms: parsePaymentTerms(form.get('payment_terms')),
			sector_id: sector ? sectorRaw : null
		};

		const errors = validateCloudCustomerInput(values);
		if (errors.length) {
			return fail(400, { error: firstFormError(errors), fieldErrors: formErrorsToObject(errors), values });
		}

		const customer = await getCustomerRepository().create(ctx, { ...values, is_active: 1 });

		await recordAuditLog(event, {
			action: 'customer.created',
			entity_type: 'customer',
			entity_id: String(customer.id),
			description: `Cliente creado: ${customer.name}`
		});

		// Se cae en la ficha, que es donde se agregan las direcciones.
		throw redirect(303, `/customers/${customer.id}`);
	}
};
