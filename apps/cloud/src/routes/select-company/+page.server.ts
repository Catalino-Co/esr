import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import {
	listUserCompanies,
	SESSION_COOKIE_NAME,
	setSessionActiveCompany
} from '$lib/server/auth';
import { requireUser } from '$lib/server/require-auth';

export const load: PageServerLoad = async ({ locals, cookies }) => {
	const user = requireUser(locals);

	if (locals.companyId) throw redirect(303, '/dashboard');

	const companies = await listUserCompanies(user.id);

	if (companies.length === 0) {
		return { companies: [], error: 'No tiene empresas activas asignadas.' };
	}

	if (companies.length === 1) {
		const sessionToken = cookies.get(SESSION_COOKIE_NAME);
		if (sessionToken) {
			const context = await setSessionActiveCompany(sessionToken, companies[0].id);
			if (context) throw redirect(303, '/dashboard');
		}
	}

	return { companies, error: null };
};

export const actions: Actions = {
	default: async ({ request, locals, cookies }) => {
		const user = requireUser(locals);
		if (locals.companyId) throw redirect(303, '/dashboard');

		const form = await request.formData();
		const companyId = String(form.get('companyId') ?? '').trim();
		if (!companyId) return fail(400, { error: 'Seleccione una empresa.' });

		const sessionToken = cookies.get(SESSION_COOKIE_NAME);
		if (!sessionToken) throw redirect(303, '/login');

		const companies = await listUserCompanies(user.id);
		const selected = companies.find((company) => company.id === companyId);
		if (!selected) {
			return fail(403, { error: 'No tiene acceso a esa empresa.', companies });
		}

		const context = await setSessionActiveCompany(sessionToken, companyId);
		if (!context) {
			return fail(403, { error: 'No se pudo activar la empresa seleccionada.', companies });
		}

		throw redirect(303, '/dashboard');
	}
};
