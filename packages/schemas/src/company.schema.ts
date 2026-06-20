import { invalid, isNonEmptyText, valid, type ESRId, type ValidationResult } from './shared';

export type CompanySettings = {
	id?: ESRId;
	company_id?: string;
	name: string;
	rnc?: string;
	phone?: string;
	email?: string;
	address?: string;
	logo_base64?: string;
};

export function validateCompanySettingsInput(company: Pick<CompanySettings, 'name'>): ValidationResult {
	return isNonEmptyText(company.name) ? valid() : invalid('company.name.required');
}
