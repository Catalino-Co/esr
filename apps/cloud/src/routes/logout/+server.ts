import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { clearSessionCookie, deleteSession, SESSION_COOKIE_NAME } from '$lib/server/auth';

export const POST: RequestHandler = async ({ cookies }) => {
	const token = cookies.get(SESSION_COOKIE_NAME);
	if (token) {
		try {
			await deleteSession(token);
		} catch {
			// Session may already be invalid; still clear the cookie.
		}
	}

	clearSessionCookie(cookies);
	throw redirect(303, '/login');
};

export const GET: RequestHandler = async ({ cookies }) => {
	const token = cookies.get(SESSION_COOKIE_NAME);
	if (token) {
		try {
			await deleteSession(token);
		} catch {
			// ignore
		}
	}

	clearSessionCookie(cookies);
	throw redirect(303, '/login');
};
