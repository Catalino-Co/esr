import { redirect } from '@sveltejs/kit';

export function requireUser(locals: App.Locals): NonNullable<App.Locals['user']> {
	if (!locals.user) throw redirect(303, '/login');
	return locals.user;
}

export function requireCompany(locals: App.Locals) {
	const user = requireUser(locals);
	if (!locals.companyId || !locals.company) throw redirect(303, '/select-company');

	return {
		user,
		company: locals.company,
		membership: locals.membership,
		companyId: locals.companyId,
		role: locals.role
	};
}

export function requireMembership(locals: App.Locals): NonNullable<App.Locals['membership']> {
	requireCompany(locals);
	if (!locals.membership) throw redirect(303, '/select-company');
	return locals.membership;
}

export function requireRole(locals: App.Locals, allowedRoles: string[]) {
	const context = requireCompany(locals);
	if (!context.role || !allowedRoles.includes(context.role)) {
		throw redirect(303, '/dashboard');
	}
	return context;
}
