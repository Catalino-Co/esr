import type {
	CompanyMemberView,
	RepositoryContext,
	TenantCompanyMemberRepository
} from '@esr/core';
import { requireCompanyId } from '@esr/core';
import type { CompanyRole, ESRId, MemberStatus } from '@esr/schemas';
import type pg from 'pg';
import { getPostgresPool } from '../connection';

const MEMBER_COLUMNS = `
	cm.id,
	cm.company_id,
	cm.user_id,
	cm.role,
	cm.status,
	cm.created_at,
	cm.updated_at,
	u.name AS user_name,
	u.email AS user_email,
	u.status AS user_status
`;

export type GlobalUserRow = {
	id: number;
	name: string;
	email: string;
	status: string;
};

export class PostgresMemberRepository implements TenantCompanyMemberRepository {
	constructor(private readonly pool: pg.Pool = getPostgresPool()) {}

	async list(ctx: RepositoryContext): Promise<CompanyMemberView[]> {
		const result = await this.pool.query<CompanyMemberView>(
			`SELECT ${MEMBER_COLUMNS}
			 FROM company_members cm
			 INNER JOIN users u ON u.id = cm.user_id
			 WHERE cm.company_id = $1
			 ORDER BY
				CASE cm.role
					WHEN 'admin' THEN 0
					WHEN 'manager' THEN 1
					WHEN 'staff' THEN 2
					ELSE 3
				END,
				u.name`,
			[requireCompanyId(ctx)]
		);
		return result.rows;
	}

	async findById(ctx: RepositoryContext, memberId: string): Promise<CompanyMemberView | null> {
		const result = await this.pool.query<CompanyMemberView>(
			`SELECT ${MEMBER_COLUMNS}
			 FROM company_members cm
			 INNER JOIN users u ON u.id = cm.user_id
			 WHERE cm.company_id = $1 AND cm.id = $2`,
			[requireCompanyId(ctx), memberId]
		);
		return result.rows[0] ?? null;
	}

	async findByEmail(ctx: RepositoryContext, email: string): Promise<CompanyMemberView | null> {
		const result = await this.pool.query<CompanyMemberView>(
			`SELECT ${MEMBER_COLUMNS}
			 FROM company_members cm
			 INNER JOIN users u ON u.id = cm.user_id
			 WHERE cm.company_id = $1 AND LOWER(u.email) = LOWER($2)`,
			[requireCompanyId(ctx), email.trim()]
		);
		return result.rows[0] ?? null;
	}

	async add(ctx: RepositoryContext, userId: ESRId, role: CompanyRole): Promise<CompanyMemberView> {
		const companyId = requireCompanyId(ctx);
		const inserted = await this.pool.query<{ id: string }>(
			`INSERT INTO company_members (company_id, user_id, role, status)
			 VALUES ($1, $2, $3, 'active')
			 ON CONFLICT (company_id, user_id) DO UPDATE SET
				role = EXCLUDED.role,
				status = 'active',
				updated_at = CURRENT_TIMESTAMP
			 RETURNING id`,
			[companyId, userId, role]
		);
		const member = await this.findById(ctx, inserted.rows[0].id);
		if (!member) throw new Error('No se pudo leer el miembro recien creado.');
		return member;
	}

	async updateRole(
		ctx: RepositoryContext,
		memberId: string,
		role: CompanyRole
	): Promise<CompanyMemberView> {
		await this.pool.query(
			`UPDATE company_members
			 SET role = $3, updated_at = CURRENT_TIMESTAMP
			 WHERE company_id = $1 AND id = $2`,
			[requireCompanyId(ctx), memberId, role]
		);
		const member = await this.findById(ctx, memberId);
		if (!member) throw new Error('Miembro no encontrado.');
		return member;
	}

	async updateStatus(
		ctx: RepositoryContext,
		memberId: string,
		status: MemberStatus
	): Promise<CompanyMemberView> {
		await this.pool.query(
			`UPDATE company_members
			 SET status = $3, updated_at = CURRENT_TIMESTAMP
			 WHERE company_id = $1 AND id = $2`,
			[requireCompanyId(ctx), memberId, status]
		);
		const member = await this.findById(ctx, memberId);
		if (!member) throw new Error('Miembro no encontrado.');
		return member;
	}

	async countActiveByRole(ctx: RepositoryContext, roles: CompanyRole[]): Promise<number> {
		if (!roles.length) return 0;
		const result = await this.pool.query<{ total: string }>(
			`SELECT COUNT(*)::text AS total
			 FROM company_members
			 WHERE company_id = $1 AND status = 'active' AND role = ANY($2::text[])`,
			[requireCompanyId(ctx), roles]
		);
		return Number(result.rows[0]?.total ?? 0);
	}

	async updateAccount(
		ctx: RepositoryContext,
		memberId: string,
		data: { name: string; email: string }
	): Promise<{ member: CompanyMemberView } | { emailEnUso: true }> {
		// El miembro tiene que ser de la empresa activa: sin esta comprobacion
		// un admin podria editar la cuenta de cualquiera pasando otro id.
		const member = await this.findById(ctx, memberId);
		if (!member) throw new Error('Miembro no encontrado.');

		const email = data.email.trim();
		const enUso = await this.pool.query<{ id: string }>(
			`SELECT id FROM users WHERE LOWER(email) = LOWER($1) AND id <> $2`,
			[email, member.user_id]
		);
		if (enUso.rows[0]) return { emailEnUso: true };

		await this.pool.query(
			`UPDATE users
			 SET name = $2, email = $3, updated_at = CURRENT_TIMESTAMP
			 WHERE id = $1`,
			[member.user_id, data.name.trim(), email]
		);

		const actualizado = await this.findById(ctx, memberId);
		if (!actualizado) throw new Error('Miembro no encontrado.');
		return { member: actualizado };
	}

	/**
	 * `users` es global: la busqueda por email es el unico puente para invitar a
	 * alguien que ya tiene cuenta. No expone usuarios de otras empresas porque
	 * solo devuelve datos publicos de la identidad, nunca su membresia ajena.
	 */
	async findGlobalUserByEmail(email: string): Promise<GlobalUserRow | null> {
		const result = await this.pool.query<GlobalUserRow>(
			`SELECT id, name, email, status FROM users WHERE LOWER(email) = LOWER($1)`,
			[email.trim()]
		);
		return result.rows[0] ?? null;
	}
}
