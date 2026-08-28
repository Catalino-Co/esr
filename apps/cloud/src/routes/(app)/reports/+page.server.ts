import type { PageServerLoad } from './$types';
import { requireCompany } from '$lib/server/require-auth';

export const load: PageServerLoad = async ({ locals }) => {
	requireCompany(locals);
	return {};
};
