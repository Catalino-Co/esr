/// <reference types="@sveltejs/kit" />

import type { AuthCompany, AuthMembership, AuthSession, AuthUser } from '$lib/server/auth-types';

declare global {
	namespace App {
		interface Locals {
			user: AuthUser | null;
			session: AuthSession | null;
			company: AuthCompany | null;
			membership: AuthMembership | null;
			role: string | null;
			companyId: string | null;
		}
	}
}

export {};
