import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { getCustomerRepository, getEventRepository } from '$lib/server/repositories';
import { recordAuditLog } from '$lib/server/audit';
import { requirePermission } from '$lib/server/permissions';
import { toTenantContext } from '$lib/server/tenant';
import { firstFormError, formErrorsToObject, validateCloudEventInput } from '$lib/server/validators';

export const load: PageServerLoad = async ({ locals }) => {
	const { companyId } = requirePermission(locals, 'events.create');
	const customers = await getCustomerRepository().list(toTenantContext(companyId), {
		is_active: 1,
		limit: 500,
		offset: 0
	});
	return { customers };
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
	default: async ({ request, locals, getClientAddress }) => {
		const { companyId } = requirePermission(locals, 'events.create');
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

		const errors = validateCloudEventInput(values);
		if (errors.length) {
			return fail(400, { error: firstFormError(errors), fieldErrors: formErrorsToObject(errors), values });
		}

		const clientError = await validateClientInCompany(companyId, values.client_id);
		if (clientError) return fail(400, { error: clientError, values });

		const event = await getEventRepository().create(ctx, {
			name: values.name,
			client_id: values.client_id || '',
			location: values.location || undefined,
			date: values.date,
			pickup_date: values.pickup_date || values.date,
			notes: values.notes || undefined,
			status: values.status,
			is_active: 1
		});

		await recordAuditLog({ locals, request, getClientAddress }, {
			action: 'event.created',
			entity_type: 'event',
			entity_id: String(event.id),
			description: `Evento creado: ${event.name}`
		});

		throw redirect(303, `/events/${event.id}`);
	}
};
