import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import {
	authenticateUser,
	createSession,
	setSessionCookie
} from '$lib/server/auth';

export const load: PageServerLoad = async ({ locals }) => {
	if (locals.user) {
		if (locals.companyId) throw redirect(303, '/dashboard');
		throw redirect(303, '/select-company');
	}
	return {};
};

export const actions: Actions = {
	default: async ({ request, cookies, url, locals, getClientAddress }) => {
		if (locals.user) {
			if (locals.companyId) throw redirect(303, '/dashboard');
			throw redirect(303, '/select-company');
		}

		const form = await request.formData();
		const email = String(form.get('email') ?? '').trim();
		const password = String(form.get('password') ?? '');

		if (!email || !password) {
			return fail(400, { error: 'Ingrese email y contraseña.', email });
		}

		let authResult;
		try {
			authResult = await authenticateUser(email, password);
		} catch {
			return fail(500, { error: 'No se pudo conectar con la base de datos.', email });
		}

		if (!authResult) {
			return fail(401, { error: 'Email o contraseña incorrectos, o el usuario no tiene empresas activas.', email });
		}

		const activeCompanyId = authResult.memberships.length === 1 ? authResult.memberships[0].company_id : null;

		const { token } = await createSession({
			userId: authResult.user.id,
			activeCompanyId,
			userAgent: request.headers.get('user-agent'),
			ipAddress: getClientAddress()
		});

		setSessionCookie(cookies, token, url.protocol === 'https:');

		if (activeCompanyId) throw redirect(303, '/dashboard');
		throw redirect(303, '/select-company');
	}
};
