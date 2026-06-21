import { requireCompany } from '$lib/server/require-auth';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals }) => {
	const context = requireCompany(locals);
	return {
		user: context.user,
		company: context.company,
		role: context.role
	};
};
