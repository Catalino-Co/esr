import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import {
	optionalText,
	saveCatalogEntry,
	text,
	toggleCatalogEntry,
	type CatalogAuditNames
} from '$lib/server/catalogs';
import { requirePermission } from '$lib/server/permissions';
import { getEventTypeRepository } from '$lib/server/repositories';
import { toTenantContext } from '$lib/server/tenant';

const NAMES: CatalogAuditNames = {
	action: 'settings.event_type',
	entity: 'event_type',
	label: 'Tipo de evento'
};

export const load: PageServerLoad = async ({ locals }) => {
	const { companyId } = requirePermission(locals, 'settings.catalogs.manage');
	// includeInactive: la pantalla de configuración también debe poder
	// reactivar lo que se desactivó antes.
	const entries = await getEventTypeRepository().list(toTenantContext(companyId), {
		includeInactive: true
	});
	return { entries };
};

export const actions: Actions = {
	save: async (event) => {
		const { companyId } = requirePermission(event.locals, 'settings.catalogs.manage');
		const form = await event.request.formData();

		return saveCatalogEntry({
			event,
			companyId,
			repo: getEventTypeRepository(),
			names: NAMES,
			id: text(form, 'id') || undefined,
			values: {
				name: text(form, 'name'),
				color: text(form, 'color') || '#6366f1',
				description: optionalText(form, 'description'),
				is_active: 1
			}
		});
	},

	toggle: async (event) => {
		const { companyId } = requirePermission(event.locals, 'settings.catalogs.manage');
		const form = await event.request.formData();
		const id = text(form, 'id');
		const isActive = text(form, 'is_active') === '1' ? 1 : 0;
		if (!id) return fail(400, { error: 'Falta el identificador.' });

		// Al desactivar se avisa si hay eventos que lo usan: no se bloquea,
		// porque el histórico debe conservar su tipo, pero conviene saberlo.
		if (isActive === 0) {
			const usages = await getEventTypeRepository().countUsages(toTenantContext(companyId), id);
			const result = await toggleCatalogEntry({
				event,
				companyId,
				repo: getEventTypeRepository(),
				names: NAMES,
				id,
				isActive
			});
			if ('success' in result && usages > 0) {
				return {
					success: `${result.success} Hay ${usages} evento(s) que lo usan; conservan su tipo.`
				};
			}
			return result;
		}

		return toggleCatalogEntry({
			event,
			companyId,
			repo: getEventTypeRepository(),
			names: NAMES,
			id,
			isActive
		});
	}
};
