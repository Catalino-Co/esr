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
}
