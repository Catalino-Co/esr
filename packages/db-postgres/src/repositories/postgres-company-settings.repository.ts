import type {
	RepositoryContext,
	TenantCompanyDefaultsInput,
	TenantCompanySettingsInput,
	TenantCompanySettingsRepository
} from '@esr/core';
import { requireCompanyId } from '@esr/core';
import type { CompanySettings } from '@esr/schemas';
import type pg from 'pg';
import { getPostgresPool } from '../connection';

/**
 * `company_info` dejo de ser un singleton global en la migracion 002:
 * su clave primaria es (company_id, id) y ESR Cloud usa siempre id = 1.
 */
const COMPANY_INFO_ROW_ID = 1;

export class PostgresCompanySettingsRepository implements TenantCompanySettingsRepository {
	constructor(private readonly pool: pg.Pool = getPostgresPool()) {}

	async get(ctx: RepositoryContext): Promise<CompanySettings | null> {
		const result = await this.pool.query<CompanySettings>(
			`SELECT id, company_id, name, rnc, phone, email, address, logo_base64,
			        default_tax_rate, default_valuation_rule
			 FROM company_info
			 WHERE company_id = $1 AND id = $2`,
			[requireCompanyId(ctx), COMPANY_INFO_ROW_ID]
		);
		return result.rows[0] ?? null;
	}

	/**
	 * Los datos que se IMPRIMEN en cada documento.
	 *
	 * El logo solo se escribe si el llamador TRAE la clave. Antes iba siempre
	 * como `data.logo_base64 ?? null`, y como la pantalla de Cloud armaba su
	 * objeto con cinco campos y sin logo, **cada guardado lo ponia a NULL**: se
	 * podia perder el membrete de la empresa por corregir una errata en el
	 * telefono. No se veia porque no habia forma de subirlo todavia.
	 *
	 * Se arregla aqui y no en la pantalla a proposito: asi ningun llamador
	 * futuro puede borrar un dato que ni siquiera menciono. Es el mismo patron
	 * que `saveInventory`.
	 */
	async upsert(ctx: RepositoryContext, data: TenantCompanySettingsInput): Promise<CompanySettings> {
		const tocaLogo = 'logo_base64' in data;

		const result = await this.pool.query<CompanySettings>(
			`INSERT INTO company_info (company_id, id, name, rnc, phone, email, address, logo_base64)
			 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
			 ON CONFLICT (company_id, id) DO UPDATE SET
				name = EXCLUDED.name,
				rnc = EXCLUDED.rnc,
				phone = EXCLUDED.phone,
				email = EXCLUDED.email,
				address = EXCLUDED.address${tocaLogo ? ',\n\t\t\t\tlogo_base64 = EXCLUDED.logo_base64' : ''}
			 RETURNING id, company_id, name, rnc, phone, email, address, logo_base64`,
			[
				requireCompanyId(ctx),
				COMPANY_INFO_ROW_ID,
				data.name,
				data.rnc ?? null,
				data.phone ?? null,
				data.email ?? null,
				data.address ?? null,
				// En el INSERT si va siempre: una fila nueva no tiene nada que
				// conservar, y `''` significa «sin logo» igual que NULL.
				data.logo_base64 || null
			]
		);
		return result.rows[0];
	}

	async updateDefaults(ctx: RepositoryContext, data: TenantCompanyDefaultsInput): Promise<CompanySettings> {
		// Acotada a [0, 100]: una tasa negativa devolveria dinero y una del 150%
		// triplicaria el documento. El <input> ya lo impide, pero esto es lo que
		// de verdad escribe.
		const tasa = Math.min(100, Math.max(0, Number(data.default_tax_rate) || 0));
		// Solo dos reglas. Cualquier otra cosa cae en `ultimo`, que es la que ve
		// una empresa que nunca abrio esta pantalla.
		const regla = data.default_valuation_rule === 'promedio3' ? 'promedio3' : 'ultimo';

		// El `INSERT ... ON CONFLICT` cubre la empresa que todavia no guardo sus
		// datos y por tanto no tiene fila. El `name` sale del tenant y solo se usa
		// en ese alta: si la fila ya existe, el `DO UPDATE` toca UNA columna y no
		// roza el nombre ni la direccion.
		const result = await this.pool.query<CompanySettings>(
			`INSERT INTO company_info (company_id, id, name, default_tax_rate, default_valuation_rule)
			 VALUES (
				$1,
				$2,
				COALESCE((SELECT name FROM companies WHERE id = $1), 'Tu Empresa'),
				$3,
				$4
			 )
			 ON CONFLICT (company_id, id) DO UPDATE SET
				default_tax_rate = EXCLUDED.default_tax_rate,
				default_valuation_rule = EXCLUDED.default_valuation_rule
			 RETURNING id, company_id, name, rnc, phone, email, address, logo_base64,
			           default_tax_rate, default_valuation_rule`,
			[requireCompanyId(ctx), COMPANY_INFO_ROW_ID, tasa, regla]
		);
		return result.rows[0];
	}
}
