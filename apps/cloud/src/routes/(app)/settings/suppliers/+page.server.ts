import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import {
	isValidEmail,
	optionalText,
	saveCatalogEntry,
	text,
	toggleCatalogEntry,
	type CatalogAuditNames
} from '$lib/server/catalogs';
import { requirePermission } from '$lib/server/permissions';
import { getSupplierRepository } from '$lib/server/repositories';
import { toTenantContext } from '$lib/server/tenant';

const NAMES: CatalogAuditNames = {
	action: 'settings.supplier',
	entity: 'supplier',
	label: 'Proveedor'
};

export const load: PageServerLoad = async ({ locals }) => {
	const { companyId } = requirePermission(locals, 'settings.catalogs.manage');
	// includeInactive: la pantalla de configuración también debe poder
	// reactivar lo que se desactivó antes.
	const entries = await getSupplierRepository().list(toTenantContext(companyId), { includeInactive: true });
	return { entries };
};

export const actions: Actions = {
	save: async (event) => {
		const { companyId } = requirePermission(event.locals, 'settings.catalogs.manage');
		const form = await event.request.formData();

		const email = optionalText(form, 'email');
		if (!isValidEmail(email)) {
			return fail(400, { error: 'El email no es válido.' });
		}

		return saveCatalogEntry({
			event,
			companyId,
			repo: getSupplierRepository(),
			names: NAMES,
			id: text(form, 'id') || undefined,
			values: {
				name: text(form, 'name'),
				contact: optionalText(form, 'contact'),
				phone: optionalText(form, 'phone'),
				email,
				service: optionalText(form, 'service'),
				notes: optionalText(form, 'notes'),
				is_active: 1
			}
		});
	},

	toggle: async (event) => {
		const { companyId } = requirePermission(event.locals, 'settings.catalogs.manage');
		const form = await event.request.formData();
		const id = text(form, 'id');
		if (!id) return fail(400, { error: 'Falta el identificador.' });

		return toggleCatalogEntry({
			event,
			companyId,
			repo: getSupplierRepository(),
			names: NAMES,
			id,
			isActive: text(form, 'is_active') === '1' ? 1 : 0
		});
	}
};
