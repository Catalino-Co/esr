import type { CompanySettings } from '@esr/schemas';

export interface CompanySettingsRepository {
	get(): Promise<CompanySettings | null>;
	update(data: CompanySettings): Promise<CompanySettings>;
}
