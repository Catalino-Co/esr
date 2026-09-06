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
import { getEventTypeRepository } from '$lib/server/repositories';
import { toTenantContext } from '$lib/server/tenant';

const NAMES: CatalogAuditNames = {
	action: 'settings.event_type',
	entity: 'event_type',
	label: 'Tipo de evento'
};

export const load: PageServerLoad = async ({ locals, url }) => {
	const { companyId } = requirePermission(locals, 'settings.catalogs.manage');
	// Un estado a la vez, como el resto de listados. Antes se mostraban activos
	// e inactivos juntos porque no habia forma de llegar a los inactivos; ahora
	// el filtro es el camino, y ademas da acceso a los archivados.
	const state = parseRecordState(url.searchParams.get('state'));
	const search = url.searchParams.get('search') ?? '';
	const entries = await getEventTypeRepository().list(toTenantContext(companyId), { state });

	// El repositorio no filtra por texto y la lista es corta: se filtra aquí,
	// igual que /settings/categories y /packages.
	const termino = search.trim().toLowerCase();
	const filtered = termino ? entries.filter((e) => (e.name ?? '').toLowerCase().includes(termino)) : entries;

	return { entries: filtered, state, search };
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
		const isActive = recordStateField(form);
		if (!id) return fail(400, { error: 'Falta el identificador.' });
		if (isActive === null) return fail(400, { error: 'Estado no válido.' });

		// Al sacarlo de circulación —desactivar o archivar— se avisa si hay
		// eventos que lo usan. No se bloquea, porque el histórico debe conservar
		// su tipo, pero conviene saberlo.
		const retirando = isActive !== RECORD_STATE.ACTIVE;
		const usages = retirando
			? await getEventTypeRepository().countUsages(toTenantContext(companyId), id)
			: 0;

		const result = await toggleCatalogEntry({
			event,
			companyId,
			repo: getEventTypeRepository(),
			names: NAMES,
			id,
			isActive
		});

		if ('success' in result && usages > 0) {
			return { success: `${result.success} Hay ${usages} evento(s) que lo usan; conservan su tipo.` };
		}
		return result;
	}
};
