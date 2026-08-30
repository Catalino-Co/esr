import { fail } from '@sveltejs/kit';
import { parseRecordState } from '@esr/core';
import type { Actions, PageServerLoad } from './$types';
import {
	isValidEmail,
	optionalText,
	recordStateField,
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

export const load: PageServerLoad = async ({ locals, url }) => {
	const { companyId } = requirePermission(locals, 'settings.catalogs.manage');
	// Un estado a la vez, como el resto de listados. Antes se mostraban activos
	// e inactivos juntos porque no habia forma de llegar a los inactivos; ahora
	// el filtro es el camino, y ademas da acceso a los archivados.
	const state = parseRecordState(url.searchParams.get('state'));
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
		const isActive = recordStateField(form);
		if (!id) return fail(400, { error: 'Falta el identificador.' });
		if (isActive === null) return fail(400, { error: 'Estado no válido.' });

		return toggleCatalogEntry({
			event,
			companyId,
			repo: getCollaboratorRepository(),
			names: NAMES,
			id,
			isActive
		});
	}
};
