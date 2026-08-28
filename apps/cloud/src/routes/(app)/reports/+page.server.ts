import type { PageServerLoad } from './$types';
import { requirePermission } from '$lib/server/permissions';

export const load: PageServerLoad = async ({ locals }) => {
	requirePermission(locals, 'reports.view');
	return {};
};
