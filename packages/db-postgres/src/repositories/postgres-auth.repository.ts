import type pg from 'pg';
import { getPostgresPool } from '../connection';

export type AuthUserRow = {
	id: number;
	name: string;
	email: string;
	password_hash: string;
	status: string;
	created_at: Date;
	updated_at: Date;
};

export type AuthCompanyRow = {
	id: string;
	name: string;
	slug: string;
	status: string;
};

export type AuthMembershipRow = {
	id: string;
	company_id: string;
	user_id: number;
	role: string;
	status: string;
	company_name: string;
	company_slug: string;
	company_status: string;
};

export type AuthSessionRow = {
	id: string;
	user_id: number;
	active_company_id: string | null;
	token_hash: string;
	expires_at: Date;
	created_at: Date;
	last_seen_at: Date | null;
};

export type CreateSessionInput = {
	userId: number;
	activeCompanyId: string | null;
	tokenHash: string;
	expiresAt: Date;
	userAgent?: string | null;
	ipAddress?: string | null;
};

export class PostgresAuthRepository {
	constructor(private readonly pool: pg.Pool = getPostgresPool()) {}

	async findUserByEmail(email: string): Promise<AuthUserRow | null> {
		const result = await this.pool.query<AuthUserRow>(
			`SELECT id, name, email, password_hash, status, created_at, updated_at
			 FROM users WHERE LOWER(email) = LOWER($1)`,
			[email.trim()]
		);
		return result.rows[0] ?? null;
	}

	async findUserById(userId: number): Promise<AuthUserRow | null> {
		const result = await this.pool.query<AuthUserRow>(
			`SELECT id, name, email, password_hash, status, created_at, updated_at
			 FROM users WHERE id = $1`,
			[userId]
		);
		return result.rows[0] ?? null;
	}

	async listActiveMemberships(userId: number): Promise<AuthMembershipRow[]> {
		const result = await this.pool.query<AuthMembershipRow>(
			`SELECT
				cm.id,
				cm.company_id,
				cm.user_id,
				cm.role,
				cm.status,
				c.name AS company_name,
				c.slug AS company_slug,
				c.status AS company_status
			 FROM company_members cm
			 INNER JOIN companies c ON c.id = cm.company_id
			 WHERE cm.user_id = $1
			   AND cm.status = 'active'
			   AND c.status = 'active'
			 ORDER BY c.name`,
			[userId]
		);
		return result.rows;
	}

	async findCompanyById(companyId: string): Promise<AuthCompanyRow | null> {
		const result = await this.pool.query<AuthCompanyRow>(
			`SELECT id, name, slug, status FROM companies WHERE id = $1`,
			[companyId]
		);
		return result.rows[0] ?? null;
	}

	async validateMembership(userId: number, companyId: string): Promise<AuthMembershipRow | null> {
		const result = await this.pool.query<AuthMembershipRow>(
			`SELECT
				cm.id,
				cm.company_id,
				cm.user_id,
				cm.role,
				cm.status,
				c.name AS company_name,
				c.slug AS company_slug,
				c.status AS company_status
			 FROM company_members cm
			 INNER JOIN companies c ON c.id = cm.company_id
			 WHERE cm.user_id = $1
			   AND cm.company_id = $2
			   AND cm.status = 'active'
			   AND c.status = 'active'`,
			[userId, companyId]
		);
		return result.rows[0] ?? null;
	}

	async createSession(input: CreateSessionInput): Promise<AuthSessionRow> {
		const result = await this.pool.query<AuthSessionRow>(
			`INSERT INTO user_sessions
				(user_id, active_company_id, token_hash, expires_at, user_agent, ip_address, last_seen_at)
			 VALUES ($1, $2, $3, $4, $5, $6, NOW())
			 RETURNING id, user_id, active_company_id, token_hash, expires_at, created_at, last_seen_at`,
			[
				input.userId,
				input.activeCompanyId,
				input.tokenHash,
				input.expiresAt,
				input.userAgent ?? null,
				input.ipAddress ?? null
			]
		);
		return result.rows[0];
	}

	async findSessionByTokenHash(tokenHash: string): Promise<AuthSessionRow | null> {
		const result = await this.pool.query<AuthSessionRow>(
			`SELECT id, user_id, active_company_id, token_hash, expires_at, created_at, last_seen_at
			 FROM user_sessions
			 WHERE token_hash = $1 AND expires_at > NOW()`,
			[tokenHash]
		);
		return result.rows[0] ?? null;
	}

	async updateSessionLastSeen(sessionId: string): Promise<void> {
		await this.pool.query('UPDATE user_sessions SET last_seen_at = NOW() WHERE id = $1', [sessionId]);
	}

	async updateSessionActiveCompany(sessionId: string, companyId: string | null): Promise<void> {
		await this.pool.query('UPDATE user_sessions SET active_company_id = $2 WHERE id = $1', [
			sessionId,
			companyId
		]);
	}

	async deleteSessionByTokenHash(tokenHash: string): Promise<void> {
		await this.pool.query('DELETE FROM user_sessions WHERE token_hash = $1', [tokenHash]);
	}
}
