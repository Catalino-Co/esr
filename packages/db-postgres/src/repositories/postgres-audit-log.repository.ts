import type { RepositoryContext } from '@esr/core';
import { requireCompanyId } from '@esr/core';
import type { AuditLog, AuditLogListFilters, CreateAuditLogInput } from '@esr/schemas';
import type pg from 'pg';
import { getPostgresPool } from '../connection';
import { appendPagination } from './pagination';

export type AuditRepositoryContext = RepositoryContext & { userId?: number | string | null };

export class PostgresAuditLogRepository {
	constructor(private readonly pool: pg.Pool = getPostgresPool()) {}

	private db(client?: pg.PoolClient) {
		return client ?? this.pool;
	}

	async list(ctx: RepositoryContext, filters: AuditLogListFilters = {}): Promise<AuditLog[]> {
		const params: unknown[] = [requireCompanyId(ctx)];
		const where = ['al.company_id = $1'];
		if (filters.action) {
			params.push(filters.action);
			where.push(`al.action = $${params.length}`);
		}
		if (filters.entity_type) {
			params.push(filters.entity_type);
			where.push(`al.entity_type = $${params.length}`);
		}
		if (filters.user_id) {
			params.push(filters.user_id);
			where.push(`al.user_id = $${params.length}`);
		}
		if (filters.date_from) {
			params.push(filters.date_from);
			where.push(`al.created_at >= $${params.length}::timestamptz`);
		}
		if (filters.date_to) {
			params.push(filters.date_to);
			where.push(`al.created_at <= $${params.length}::timestamptz`);
		}
		const result = await this.pool.query<AuditLog & { user_email?: string | null; user_name?: string | null }>(
			`SELECT al.*, u.email AS user_email, u.name AS user_name
			 FROM audit_logs al
			 LEFT JOIN users u ON u.id = al.user_id
			 WHERE ${where.join(' AND ')}
			 ORDER BY al.created_at DESC${appendPagination(params, filters)}`,
			params
		);
		return result.rows;
	}

	async create(ctx: AuditRepositoryContext, data: CreateAuditLogInput, client?: pg.PoolClient): Promise<AuditLog> {
		const result = await this.db(client).query<AuditLog>(
			`INSERT INTO audit_logs
				(company_id, user_id, action, entity_type, entity_id, description, metadata, ip_address, user_agent)
			 VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9)
			 RETURNING *`,
			[
				requireCompanyId(ctx),
				ctx.userId ?? null,
				data.action,
				data.entity_type,
				data.entity_id ?? null,
				data.description ?? null,
				data.metadata ? JSON.stringify(data.metadata) : null,
				data.ip_address ?? null,
				data.user_agent ?? null
			]
		);
		return result.rows[0];
	}

	async findByEntity(ctx: RepositoryContext, entityType: string, entityId: string): Promise<AuditLog[]> {
		const params: unknown[] = [requireCompanyId(ctx), entityType, entityId];
		const result = await this.pool.query<AuditLog>(
			`SELECT * FROM audit_logs WHERE company_id = $1 AND entity_type = $2 AND entity_id = $3
			 ORDER BY created_at DESC LIMIT 50`,
			params
		);
		return result.rows;
	}
}

export type CompanyDocumentInfo = {
	name: string;
	rnc?: string | null;
	phone?: string | null;
	email?: string | null;
	address?: string | null;
};

export async function getCompanyDocumentInfo(
	ctx: RepositoryContext,
	pool: pg.Pool = getPostgresPool()
): Promise<CompanyDocumentInfo> {
	const companyId = requireCompanyId(ctx);
	const result = await pool.query<CompanyDocumentInfo>(
		`SELECT COALESCE(ci.name, c.name) AS name, ci.rnc, ci.phone, ci.email, ci.address
		 FROM companies c
		 LEFT JOIN company_info ci ON ci.company_id = c.id AND ci.id = 1
		 WHERE c.id = $1`,
		[companyId]
	);
	return result.rows[0] ?? { name: 'Empresa' };
}
