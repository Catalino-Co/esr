import type { PageServerLoad } from './$types';
import { getConduceRepository } from '$lib/server/repositories';
import { requirePermission } from '$lib/server/permissions';
import { toTenantContext } from '$lib/server/tenant';

export const load: PageServerLoad = async ({ locals }) => {
	const { companyId } = requirePermission(locals, 'conduces.view');
	const ctx = toTenantContext(companyId);
	const conduces = await getConduceRepository().list(ctx, { limit: 100, offset: 0 });
	return { conduces };
};
