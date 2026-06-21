import { createHash, randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import type { Cookies } from '@sveltejs/kit';
import {
	PostgresAuthRepository,
	type AuthCompanyRow,
	type AuthMembershipRow,
	type AuthSessionRow,
	type AuthUserRow
} from '@esr/db-postgres';
import type {
	AuthCompany,
	AuthMembership,
	AuthSession,
	AuthUser,
	SessionContext
} from './auth-types';

export const SESSION_COOKIE_NAME = 'esr_cloud_session';
export const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000;
const BCRYPT_ROUNDS = 10;

let authRepository: PostgresAuthRepository | null = null;

function getAuthRepository(): PostgresAuthRepository {
	if (!authRepository) authRepository = new PostgresAuthRepository();
	return authRepository;
}

export async function hashPassword(password: string): Promise<string> {
	return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export async function verifyPassword(password: string, passwordHash: string): Promise<boolean> {
	if (!passwordHash || passwordHash.startsWith('!')) return false;
	return bcrypt.compare(password, passwordHash);
}

function hashSessionToken(token: string): string {
	return createHash('sha256').update(token, 'utf8').digest('hex');
}

function generateSessionToken(): string {
	return randomBytes(32).toString('hex');
}

function toAuthUser(row: AuthUserRow): AuthUser {
	return {
		id: row.id,
		name: row.name,
		email: row.email,
		status: row.status
	};
}

function toAuthCompany(row: AuthCompanyRow): AuthCompany {
	return {
		id: row.id,
		name: row.name,
		slug: row.slug,
		status: row.status
	};
}

function toAuthMembership(row: AuthMembershipRow): AuthMembership {
	return {
		id: row.id,
		companyId: row.company_id,
		userId: row.user_id,
		role: row.role,
		status: row.status
	};
}

function toAuthSession(row: AuthSessionRow): AuthSession {
	return {
		id: row.id,
		userId: row.user_id,
		activeCompanyId: row.active_company_id,
		expiresAt: row.expires_at.toISOString()
	};
}

export type CreateSessionInput = {
	userId: number;
	activeCompanyId?: string | null;
	userAgent?: string | null;
	ipAddress?: string | null;
};

export async function createSession(
	input: CreateSessionInput
): Promise<{ token: string; expiresAt: Date; session: AuthSession }> {
	const token = generateSessionToken();
	const tokenHash = hashSessionToken(token);
	const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);

	const row = await getAuthRepository().createSession({
		userId: input.userId,
		activeCompanyId: input.activeCompanyId ?? null,
		tokenHash,
		expiresAt,
		userAgent: input.userAgent,
		ipAddress: input.ipAddress
	});

	return { token, expiresAt, session: toAuthSession(row) };
}

export type ValidateSessionOptions = {
	userAgent?: string | null;
	ipAddress?: string | null;
};

export async function validateSessionToken(
	token: string,
	_options: ValidateSessionOptions = {}
): Promise<SessionContext | null> {
	const tokenHash = hashSessionToken(token);
	const sessionRow = await getAuthRepository().findSessionByTokenHash(tokenHash);
	if (!sessionRow) return null;

	const userRow = await getAuthRepository().findUserById(sessionRow.user_id);
	if (!userRow || userRow.status !== 'active') {
		await getAuthRepository().deleteSessionByTokenHash(tokenHash);
		return null;
	}

	await getAuthRepository().updateSessionLastSeen(sessionRow.id);

	let company: AuthCompany | null = null;
	let membership: AuthMembership | null = null;
	let role: string | null = null;
	let companyId: string | null = null;

	if (sessionRow.active_company_id) {
		const membershipRow = await getAuthRepository().validateMembership(
			userRow.id,
			sessionRow.active_company_id
		);
		if (!membershipRow) {
			await getAuthRepository().updateSessionActiveCompany(sessionRow.id, null);
		} else {
			company = toAuthCompany({
				id: membershipRow.company_id,
				name: membershipRow.company_name,
				slug: membershipRow.company_slug,
				status: membershipRow.company_status
			});
			membership = toAuthMembership(membershipRow);
			role = membershipRow.role;
			companyId = membershipRow.company_id;
		}
	}

	return {
		user: toAuthUser(userRow),
		session: toAuthSession(sessionRow),
		company,
		membership,
		role,
		companyId
	};
}

export async function deleteSession(token: string): Promise<void> {
	await getAuthRepository().deleteSessionByTokenHash(hashSessionToken(token));
}

export async function setSessionActiveCompany(
	token: string,
	companyId: string
): Promise<SessionContext | null> {
	const tokenHash = hashSessionToken(token);
	const sessionRow = await getAuthRepository().findSessionByTokenHash(tokenHash);
	if (!sessionRow) return null;

	const membershipRow = await getAuthRepository().validateMembership(sessionRow.user_id, companyId);
	if (!membershipRow) return null;

	await getAuthRepository().updateSessionActiveCompany(sessionRow.id, companyId);
	return validateSessionToken(token);
}

export function getSessionCookieOptions(secure: boolean) {
	return {
		httpOnly: true,
		path: '/',
		sameSite: 'lax' as const,
		secure,
		maxAge: Math.floor(SESSION_DURATION_MS / 1000)
	};
}

export function setSessionCookie(cookies: Cookies, token: string, secure: boolean): void {
	cookies.set(SESSION_COOKIE_NAME, token, getSessionCookieOptions(secure));
}

export function clearSessionCookie(cookies: Cookies): void {
	cookies.delete(SESSION_COOKIE_NAME, { path: '/' });
}

export async function authenticateUser(
	email: string,
	password: string
): Promise<{ user: AuthUser; memberships: AuthMembershipRow[] } | null> {
	const userRow = await getAuthRepository().findUserByEmail(email);
	if (!userRow || userRow.status !== 'active') return null;

	const validPassword = await verifyPassword(password, userRow.password_hash);
	if (!validPassword) return null;

	const memberships = await getAuthRepository().listActiveMemberships(userRow.id);
	if (memberships.length === 0) return null;

	return { user: toAuthUser(userRow), memberships };
}

export async function listUserCompanies(userId: number): Promise<
	Array<AuthCompany & { role: string; membershipId: string }>
> {
	const memberships = await getAuthRepository().listActiveMemberships(userId);
	return memberships.map((row) => ({
		id: row.company_id,
		name: row.company_name,
		slug: row.company_slug,
		status: row.company_status,
		role: row.role,
		membershipId: row.id
	}));
}

export { getAuthRepository as authRepository };
