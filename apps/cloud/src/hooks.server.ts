import type { Handle } from '@sveltejs/kit';
import {
	clearSessionCookie,
	SESSION_COOKIE_NAME,
	validateSessionToken
} from '$lib/server/auth';

function emptyLocals(event: Parameters<Handle>[0]['event']): void {
	event.locals.user = null;
	event.locals.session = null;
	event.locals.company = null;
	event.locals.membership = null;
	event.locals.role = null;
	event.locals.companyId = null;
}

export const handle: Handle = async ({ event, resolve }) => {
	emptyLocals(event);

	const token = event.cookies.get(SESSION_COOKIE_NAME);
	if (!token) return resolve(event);

	try {
		const context = await validateSessionToken(token, {
			userAgent: event.request.headers.get('user-agent'),
			ipAddress: event.getClientAddress()
		});

		if (!context) {
			clearSessionCookie(event.cookies);
			return resolve(event);
		}

		event.locals.user = context.user;
		event.locals.session = context.session;
		event.locals.company = context.company;
		event.locals.membership = context.membership;
		event.locals.role = context.role;
		event.locals.companyId = context.companyId;
	} catch {
		clearSessionCookie(event.cookies);
		emptyLocals(event);
	}

	return resolve(event);
};
