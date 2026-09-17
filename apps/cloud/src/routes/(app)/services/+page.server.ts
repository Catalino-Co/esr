import { fail } from '@sveltejs/kit';
import { parseRecordState } from '@esr/core';
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
import { getServiceRepository } from '$lib/server/repositories';
import { toTenantContext } from '$lib/server/tenant';

const NAMES: CatalogAuditNames = {
	action: 'settings.service',
	entity: 'service',
	label: 'Servicio'
};

export const load: PageServerLoad = async ({ locals, url }) => {
	const { companyId } = requirePermission(locals, 'services.view');
	const state = parseRecordState(url.searchParams.get('state'));
	const search = url.searchParams.get('search') ?? '';
	const entries = await getServiceRepository().list(toTenantContext(companyId), { state });

	// El repositorio no filtra por texto y la lista es corta: se filtra aqui,
	// igual que /settings/suppliers y /packages.
	const termino = search.trim().toLowerCase();
	const filtered = termino ? entries.filter((e) => (e.name ?? '').toLowerCase().includes(termino)) : entries;

	return { entries: filtered, state, search };
};

export const actions: Actions = {
	save: async (event) => {
		const form = await event.request.formData();
		const id = text(form, 'id') || undefined;
		// Crear y editar piden permisos distintos, aunque los dos lleguen a la
		// misma action -el `id` presente es lo unico que distingue un caso del otro.
		const { companyId } = requirePermission(event.locals, id ? 'services.update' : 'services.create');

		const price = Number(text(form, 'price') || 0);
		if (!Number.isFinite(price) || price < 0) {
			return fail(400, { error: 'El precio no puede ser negativo.', values: { name: text(form, 'name') } });
		}

		return saveCatalogEntry({
			event,
			companyId,
			repo: getServiceRepository(),
			names: NAMES,
			id,
			values: {
				name: text(form, 'name'),
				price,
				notes: optionalText(form, 'notes'),
				is_active: 1
			}
		});
	},

	toggle: async (event) => {
		const { companyId } = requirePermission(event.locals, 'services.archive');
		const form = await event.request.formData();
		const id = text(form, 'id');
		const isActive = recordStateField(form);
		if (!id) return fail(400, { error: 'Falta el identificador.' });
		if (isActive === null) return fail(400, { error: 'Estado no válido.' });

		return toggleCatalogEntry({
			event,
			companyId,
			repo: getServiceRepository(),
			names: NAMES,
			id,
			isActive
		});
	}
};
