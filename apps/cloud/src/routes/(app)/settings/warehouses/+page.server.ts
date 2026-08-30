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
import { getWarehouseRepository } from '$lib/server/repositories';
import { toTenantContext } from '$lib/server/tenant';

const NAMES: CatalogAuditNames = {
	action: 'settings.warehouse',
	entity: 'warehouse',
	label: 'Almacén'
};

export const load: PageServerLoad = async ({ locals, url }) => {
	const { companyId } = requirePermission(locals, 'settings.catalogs.manage');
	const state = parseRecordState(url.searchParams.get('state'));
	const entries = await getWarehouseRepository().list(toTenantContext(companyId), { state });
	return { entries, state };
};

export const actions: Actions = {
	save: async (event) => {
		const { companyId } = requirePermission(event.locals, 'settings.catalogs.manage');
		const form = await event.request.formData();

		return saveCatalogEntry({
			event,
			companyId,
			repo: getWarehouseRepository(),
			names: NAMES,
			id: text(form, 'id') || undefined,
			values: {
				name: text(form, 'name'),
				code: optionalText(form, 'code'),
				address: optionalText(form, 'address'),
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

		// Lo que pesa al sacar un almacén de circulación es que TENGA
		// existencias, no que existan artículos: uno vacío se archiva sin más.
		// Se avisa y no se bloquea, como en el resto de catálogos.
		const usages =
			isActive === RECORD_STATE.ACTIVE
				? 0
				: await getWarehouseRepository().countUsages(toTenantContext(companyId), id);

		const result = await toggleCatalogEntry({
			event,
			companyId,
			repo: getWarehouseRepository(),
			names: NAMES,
			id,
			isActive
		});

		if ('success' in result && usages > 0) {
			return {
				success: `${result.success} Todavía guarda existencias de ${usages} artículo(s); no se han movido.`
			};
		}
		return result;
	}
};
