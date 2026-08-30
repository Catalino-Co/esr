import { fail } from '@sveltejs/kit';
import { RECORD_STATE, parseRecordState } from '@esr/core';
import type { Actions, PageServerLoad } from './$types';
import {
	optionalText,
	recordStateField,
	saveCatalogEntry,
	text,
	toggleCatalogEntry,
	type CatalogAuditNames
} from '$lib/server/catalogs';
import { requirePermission } from '$lib/server/permissions';
import { getCommercialSectorRepository } from '$lib/server/repositories';
import { toTenantContext } from '$lib/server/tenant';

const NAMES: CatalogAuditNames = {
	action: 'settings.commercial_sector',
	entity: 'commercial_sector',
	label: 'Sector comercial'
};

export const load: PageServerLoad = async ({ locals, url }) => {
	const { companyId } = requirePermission(locals, 'settings.catalogs.manage');
	const state = parseRecordState(url.searchParams.get('state'));
	const entries = await getCommercialSectorRepository().list(toTenantContext(companyId), { state });
	return { entries, state };
};

export const actions: Actions = {
	save: async (event) => {
		const { companyId } = requirePermission(event.locals, 'settings.catalogs.manage');
		const form = await event.request.formData();

		return saveCatalogEntry({
			event,
			companyId,
			repo: getCommercialSectorRepository(),
			names: NAMES,
			id: text(form, 'id') || undefined,
			values: {
				name: text(form, 'name'),
				description: optionalText(form, 'description'),
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

		// Al sacarlo de circulación se avisa si hay registros que lo usan. No se
		// bloquea: el cliente conserva su sector.
		const usages =
			isActive === RECORD_STATE.ACTIVE
				? 0
				: await getCommercialSectorRepository().countUsages(toTenantContext(companyId), id);

		const result = await toggleCatalogEntry({
			event,
			companyId,
			repo: getCommercialSectorRepository(),
			names: NAMES,
			id,
			isActive
		});

		if ('success' in result && usages > 0) {
			return { success: `${result.success} Hay ${usages} cliente(s) en este sector; lo conservan.` };
		}
		return result;
	}
};
