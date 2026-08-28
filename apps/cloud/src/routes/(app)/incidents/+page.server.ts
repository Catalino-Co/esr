import type { PageServerLoad } from './$types';
import { getIncidentRepository } from '$lib/server/repositories';
import { requirePermission } from '$lib/server/permissions';
import { toTenantContext } from '$lib/server/tenant';

export const load: PageServerLoad = async ({ locals }) => {
	const { companyId } = requirePermission(locals, 'incidents.view');
	const ctx = toTenantContext(companyId);
	const incidents = await getIncidentRepository().list(ctx, { limit: 100, offset: 0 });
	return { incidents };
};
