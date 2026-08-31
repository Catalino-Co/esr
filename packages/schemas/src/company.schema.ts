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
	/**
	 * Impuesto por defecto, en PORCENTAJE (18 para el ITBIS). Lo PROPONE cada
	 * linea nueva de cotizacion; no reescribe nada ya hecho.
	 *
	 * Opcional a proposito: `TenantCompanySettingsInput` sale de este tipo y lo
	 * usa la pantalla de «Datos de la empresa», que no lo toca. Quien lo
	 * escribe es `updateDefaults`.
	 */
	default_tax_rate?: number;
	/**
	 * Como se valora el stock: `ultimo` (el costo de la ultima entrada) o
	 * `promedio3` (la media de las tres ultimas). Solo afecta a la columna Valor
	 * del inventario; no toca precios ni documentos.
	 */
	default_valuation_rule?: string;
};

export function validateCompanySettingsInput(company: Pick<CompanySettings, 'name'>): ValidationResult {
	return isNonEmptyText(company.name) ? valid() : invalid('company.name.required');
}
