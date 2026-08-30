import type { CompanyRole, ESRId, MemberStatus } from '@esr/schemas';
import type { RepositoryContext } from '../shared/tenant';

/**
 * Vista de un miembro con los datos de la identidad global asociada.
 * `users` es una tabla global; solo se expone a traves de `company_members`,
 * de modo que una empresa nunca ve usuarios que no le pertenecen.
 */
export type CompanyMemberView = {
	id: string;
	company_id: string;
	user_id: ESRId;
	role: CompanyRole;
	status: MemberStatus;
	user_name: string;
	user_email: string;
	user_status: string;
	created_at?: string;
	updated_at?: string;
};

export type InviteMemberInput = {
	email: string;
	role: CompanyRole;
};

export interface TenantCompanyMemberRepository {
	list(ctx: RepositoryContext): Promise<CompanyMemberView[]>;
	findById(ctx: RepositoryContext, memberId: string): Promise<CompanyMemberView | null>;
	findByEmail(ctx: RepositoryContext, email: string): Promise<CompanyMemberView | null>;
	add(ctx: RepositoryContext, userId: ESRId, role: CompanyRole): Promise<CompanyMemberView>;
	updateRole(ctx: RepositoryContext, memberId: string, role: CompanyRole): Promise<CompanyMemberView>;
	updateStatus(
		ctx: RepositoryContext,
		memberId: string,
		status: MemberStatus
	): Promise<CompanyMemberView>;
	countActiveByRole(ctx: RepositoryContext, roles: CompanyRole[]): Promise<number>;
	/**
	 * Escribe el nombre y el email en `users`, la identidad GLOBAL.
	 *
	 * Lo que se cambia aqui no pertenece a la empresa: el email es la
	 * credencial de acceso y el nombre se ve en todas las empresas donde esa
	 * persona sea miembro. Por eso la implementacion debe comprobar antes que
	 * el miembro pertenece a la empresa activa, o seria una via para editar
	 * cuentas ajenas.
	 *
	 * Devuelve `{ emailEnUso: true }` si el email ya es de otra cuenta, en vez
	 * de dejar que salte el UNIQUE de PostgreSQL.
	 */
	updateAccount(
		ctx: RepositoryContext,
		memberId: string,
		data: { name: string; email: string }
	): Promise<{ member: CompanyMemberView } | { emailEnUso: true }>;
}
