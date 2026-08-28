import { requirePermission } from '$lib/server/permissions';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals }) => {
	requirePermission(locals, 'settings.view');
	return {};
};
