import type { CompanySettings } from '@esr/schemas';
import type { RepositoryContext } from '../shared/tenant';

export interface CompanySettingsRepository {
	get(): Promise<CompanySettings | null>;
	update(data: CompanySettings): Promise<CompanySettings>;
}

/**
 * Contrato Cloud: los ajustes de empresa viven en una fila por `company_id`.
 * El contrato sin contexto de arriba se conserva para ESR Pro (SQLite).
 */
export interface TenantCompanySettingsRepository {
	get(ctx: RepositoryContext): Promise<CompanySettings | null>;
	upsert(ctx: RepositoryContext, data: TenantCompanySettingsInput): Promise<CompanySettings>;
}

export type TenantCompanySettingsInput = Omit<CompanySettings, 'id' | 'company_id'>;
