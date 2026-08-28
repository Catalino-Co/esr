import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { recordAuditLog } from '$lib/server/audit';
import { requirePermission } from '$lib/server/permissions';
import { getCompanySettingsRepository } from '$lib/server/repositories';
import { toTenantContext } from '$lib/server/tenant';
import { firstFormError, formErrorsToObject, validateCloudCompanySettingsInput } from '$lib/server/validators';

export const load: PageServerLoad = async ({ locals }) => {
	const { companyId, company } = requirePermission(locals, 'settings.company.update');
	const settings = await getCompanySettingsRepository().get(toTenantContext(companyId));

	return {
		// Sin fila en company_info se parte del nombre del tenant.
		settings: settings ?? { name: company.name, rnc: '', phone: '', email: '', address: '' }
	};
};

export const actions: Actions = {
	default: async ({ request, locals, getClientAddress }) => {
		const { companyId } = requirePermission(locals, 'settings.company.update');
		const form = await request.formData();

		const values = {
			name: String(form.get('name') ?? '').trim(),
			rnc: String(form.get('rnc') ?? '').trim(),
			phone: String(form.get('phone') ?? '').trim(),
			email: String(form.get('email') ?? '').trim(),
			address: String(form.get('address') ?? '').trim()
		};

		const errors = validateCloudCompanySettingsInput(values);
		if (errors.length) {
			return fail(400, { error: firstFormError(errors), fieldErrors: formErrorsToObject(errors), values });
		}

		await getCompanySettingsRepository().upsert(toTenantContext(companyId), values);

		await recordAuditLog({ locals, request, getClientAddress }, {
			action: 'settings.company.updated',
			entity_type: 'company_settings',
			entity_id: companyId,
			description: `Datos de empresa actualizados: ${values.name}`
		});

		return { success: 'Datos de la empresa guardados.', values };
	}
};
