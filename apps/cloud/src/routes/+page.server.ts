import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (locals.user) {
		if (locals.companyId) throw redirect(303, '/dashboard');
		throw redirect(303, '/select-company');
	}
	throw redirect(303, '/login');
};
