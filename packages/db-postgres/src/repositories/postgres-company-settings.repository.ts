import type {
	RepositoryContext,
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
			`SELECT id, company_id, name, rnc, phone, email, address, logo_base64
			 FROM company_info
			 WHERE company_id = $1 AND id = $2`,
			[requireCompanyId(ctx), COMPANY_INFO_ROW_ID]
		);
		return result.rows[0] ?? null;
	}

	async upsert(ctx: RepositoryContext, data: TenantCompanySettingsInput): Promise<CompanySettings> {
		const result = await this.pool.query<CompanySettings>(
			`INSERT INTO company_info (company_id, id, name, rnc, phone, email, address, logo_base64)
			 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
			 ON CONFLICT (company_id, id) DO UPDATE SET
				name = EXCLUDED.name,
				rnc = EXCLUDED.rnc,
				phone = EXCLUDED.phone,
				email = EXCLUDED.email,
				address = EXCLUDED.address,
				logo_base64 = EXCLUDED.logo_base64
			 RETURNING id, company_id, name, rnc, phone, email, address, logo_base64`,
			[
				requireCompanyId(ctx),
				COMPANY_INFO_ROW_ID,
				data.name,
				data.rnc ?? null,
				data.phone ?? null,
				data.email ?? null,
				data.address ?? null,
				data.logo_base64 ?? null
			]
		);
		return result.rows[0];
	}
}
