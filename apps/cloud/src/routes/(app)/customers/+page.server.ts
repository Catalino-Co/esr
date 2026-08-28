import type { PageServerLoad } from './$types';
import { getCustomerRepository } from '$lib/server/repositories';
import { requirePermission } from '$lib/server/permissions';
import { toTenantContext } from '$lib/server/tenant';

export const load: PageServerLoad = async ({ locals, url }) => {
	const { companyId } = requirePermission(locals, 'customers.view');
	const search = url.searchParams.get('search')?.trim() || undefined;
	const status = url.searchParams.get('status');

	const customers = await getCustomerRepository().list(toTenantContext(companyId), {
		search,
		is_active: status === 'inactive' ? 0 : status === 'active' ? 1 : undefined,
		limit: 100,
		offset: 0
	});

	return { customers, search: search ?? '', status: status ?? 'all' };
};
