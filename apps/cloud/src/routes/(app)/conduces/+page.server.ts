import type { PageServerLoad } from './$types';
import { getConduceRepository } from '$lib/server/repositories';
import { requireCompany } from '$lib/server/require-auth';
import { toTenantContext } from '$lib/server/tenant';

export const load: PageServerLoad = async ({ locals }) => {
	const { companyId } = requireCompany(locals);
	const ctx = toTenantContext(companyId);
	const conduces = await getConduceRepository().list(ctx, { limit: 100, offset: 0 });
	return { conduces };
};
