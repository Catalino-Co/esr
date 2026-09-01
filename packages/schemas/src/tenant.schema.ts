import { invalid, isNonEmptyText, valid, type ESRId, type Nullable, type ValidationResult } from './shared';

export type CompanyStatus = 'active' | 'inactive';
/**
 * Los roles de una empresa.
 *
 * `owner` se elimino en la migracion 024: tenia EXACTAMENTE los mismos
 * permisos que `admin` —el mismo array por referencia en la matriz— y lo unico
 * que aportaba eran guardas de mutacion.
 */
export type CompanyRole = 'admin' | 'manager' | 'staff' | 'viewer';
export type MemberStatus = 'active' | 'inactive' | 'invited';

export type Company = {
	id?: Nullable<ESRId>;
	name: string;
	slug: string;
	status: CompanyStatus;
	created_at?: string;
	updated_at?: string;
};

export type CompanyMember = {
	id?: Nullable<ESRId>;
	company_id: string;
	user_id: ESRId;
	role: CompanyRole;
	status: MemberStatus;
	created_at?: string;
	updated_at?: string;
};

export type CompanyScoped = {
	company_id?: string;
};

export function validateCompanyInput(company: Pick<Company, 'name' | 'slug'>): ValidationResult {
	return isNonEmptyText(company.name) && isNonEmptyText(company.slug)
		? valid()
		: invalid('company.required_fields');
}

export function validateCompanyMemberInput(
	member: Pick<CompanyMember, 'company_id' | 'user_id' | 'role'>
): ValidationResult {
	return isNonEmptyText(member.company_id) && member.user_id != null && isNonEmptyText(member.role)
		? valid()
		: invalid('company_member.required_fields');
}
