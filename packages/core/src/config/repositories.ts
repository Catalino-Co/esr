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
	/**
	 * Los valores por defecto de operacion, que NO son los datos impresos.
	 *
	 * Separado de `upsert` a proposito: aquel escribe las ocho columnas y `name`
	 * es NOT NULL, asi que guardar el impuesto por ahi borraria el nombre y la
	 * direccion de la empresa. Dos pantallas, dos escrituras.
	 */
	updateDefaults(ctx: RepositoryContext, data: TenantCompanyDefaultsInput): Promise<CompanySettings>;
}

export type TenantCompanySettingsInput = Omit<CompanySettings, 'id' | 'company_id'>;
export type TenantCompanyDefaultsInput = { default_tax_rate: number };
