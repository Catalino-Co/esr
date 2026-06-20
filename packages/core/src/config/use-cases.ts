import { validateCompanySettingsInput, type CompanySettings } from '@esr/schemas';
import { fail, ok, type UseCaseResult } from '../shared/result';

export type AppearanceScale = 'auto' | 'compact' | 'comfortable';

export function validateCompanySettingsDraft(input: CompanySettings): UseCaseResult<CompanySettings> {
	const validation = validateCompanySettingsInput(input);
	return validation.valid ? ok(input) : fail(validation.issues[0] || 'company.invalid');
}

export function getAppearanceScale(value: string | null | undefined): number {
	if (value === 'compact') return 0.9;
	if (value === 'comfortable') return 1.08;
	return 1;
}

