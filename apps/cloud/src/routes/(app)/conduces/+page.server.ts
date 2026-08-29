import { parseRecordState } from '@esr/core';
import type { PageServerLoad } from './$types';
import { requirePermission } from '$lib/server/permissions';
import { getConduceRepository } from '$lib/server/repositories';
import { toTenantContext } from '$lib/server/tenant';

export const load: PageServerLoad = async ({ locals, url }) => {
	const { companyId } = requirePermission(locals, 'conduces.view');
	const ctx = toTenantContext(companyId);

	// Esta pantalla no tenia filtros: ni siquiera recibia `url`. El repositorio
	// tampoco soportaba busqueda; se amplio ConduceListFilters para esto.
	const search = url.searchParams.get('search')?.trim() || undefined;
	const type = url.searchParams.get('type')?.trim() || undefined;
	const state = parseRecordState(url.searchParams.get('state'));

	const conduces = await getConduceRepository().list(ctx, {
		search,
		conduce_type: type,
		state,
		limit: 100,
		offset: 0
	});

	return { conduces, search: search ?? '', type: type ?? '', state };
};
