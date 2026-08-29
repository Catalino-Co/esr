import { fail } from '@sveltejs/kit';
import { RECORD_STATE, SELECTABLE_STATES } from '@esr/core';
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
import { getCollaboratorRepository } from '$lib/server/repositories';
import { toTenantContext } from '$lib/server/tenant';

const NAMES: CatalogAuditNames = {
	action: 'settings.collaborator',
	entity: 'collaborator',
	label: 'Colaborador'
};

export const load: PageServerLoad = async ({ locals }) => {
	const { companyId } = requirePermission(locals, 'settings.catalogs.manage');
	// Sin selector de estado: la pantalla muestra activos e inactivos a la vez,
	// porque reactivar solo se puede desde la propia fila.
	const state = SELECTABLE_STATES;
	const entries = await getCollaboratorRepository().list(toTenantContext(companyId), { state });
	return { entries, state };
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
			repo: getCollaboratorRepository(),
			names: NAMES,
			id: text(form, 'id') || undefined,
			values: {
				name: text(form, 'name'),
				role: optionalText(form, 'role'),
				phone: optionalText(form, 'phone'),
				email,
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
			repo: getCollaboratorRepository(),
			names: NAMES,
			id,
			isActive: text(form, 'is_active') === '1' ? RECORD_STATE.ACTIVE : RECORD_STATE.INACTIVE
		});
	}
};
