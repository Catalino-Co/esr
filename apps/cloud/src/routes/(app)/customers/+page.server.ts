import { parseRecordState } from '@esr/core';
import type { PageServerLoad } from './$types';
import { requirePermission } from '$lib/server/permissions';
import { getCustomerRepository } from '$lib/server/repositories';
import { toTenantContext } from '$lib/server/tenant';

export const load: PageServerLoad = async ({ locals, url }) => {
	const { companyId } = requirePermission(locals, 'customers.view');
	const search = url.searchParams.get('search')?.trim() || undefined;
	// Sin `state` en la URL se listan los activos: no existe vista «todos».
	const state = parseRecordState(url.searchParams.get('state'));

	const customers = await getCustomerRepository().list(toTenantContext(companyId), {
		search,
		state,
		limit: 100,
		offset: 0
	});

	return { customers, search: search ?? '', state };
};
