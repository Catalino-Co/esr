import { sessionPermissions } from '$lib/server/permissions';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => ({
	permissions: sessionPermissions(locals)
});
