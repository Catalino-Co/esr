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
import { getUnitOfMeasureRepository } from '$lib/server/repositories';
import { toTenantContext } from '$lib/server/tenant';

const NAMES: CatalogAuditNames = {
	action: 'settings.unit_of_measure',
	entity: 'unit_of_measure',
	label: 'Unidad de medida'
};

export const load: PageServerLoad = async ({ locals, url }) => {
	const { companyId } = requirePermission(locals, 'settings.catalogs.manage');
	const state = parseRecordState(url.searchParams.get('state'));
	const entries = await getUnitOfMeasureRepository().list(toTenantContext(companyId), { state });
	return { entries, state };
};

export const actions: Actions = {
	save: async (event) => {
		const { companyId } = requirePermission(event.locals, 'settings.catalogs.manage');
		const form = await event.request.formData();

		return saveCatalogEntry({
			event,
			companyId,
			repo: getUnitOfMeasureRepository(),
			names: NAMES,
			id: text(form, 'id') || undefined,
			values: {
				name: text(form, 'name'),
				abbr: optionalText(form, 'abbr'),
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

		// Se avisa y no se bloquea: el artículo conserva su unidad.
		const usages =
			isActive === RECORD_STATE.ACTIVE
				? 0
				: await getUnitOfMeasureRepository().countUsages(toTenantContext(companyId), id);

		const result = await toggleCatalogEntry({
			event,
			companyId,
			repo: getUnitOfMeasureRepository(),
			names: NAMES,
			id,
			isActive
		});

		if ('success' in result && usages > 0) {
			return { success: `${result.success} Hay ${usages} artículo(s) con esta unidad; la conservan.` };
		}
		return result;
	}
};
