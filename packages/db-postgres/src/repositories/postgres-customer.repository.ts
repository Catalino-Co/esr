import type { CustomerListFilters, RepositoryContext, TenantCreateCustomerInput, TenantCustomerRepository } from '@esr/core';
import { requireCompanyId } from '@esr/core';
import type { Customer, ESRId } from '@esr/schemas';
import type pg from 'pg';
import { getPostgresPool } from '../connection';
import { appendPagination } from './pagination';

export class PostgresCustomerRepository implements TenantCustomerRepository {
	constructor(private readonly pool: pg.Pool = getPostgresPool()) {}

	async findById(ctx: RepositoryContext, id: ESRId): Promise<Customer | null> {
		const companyId = requireCompanyId(ctx);
		const result = await this.pool.query<Customer>(
			'SELECT * FROM clients WHERE company_id = $1 AND id = $2',
			[companyId, id]
		);
		return result.rows[0] ?? null;
	}

	async list(ctx: RepositoryContext, filters: CustomerListFilters = {}): Promise<Customer[]> {
		const params: unknown[] = [requireCompanyId(ctx)];
		const where = ['company_id = $1'];
		if (filters.search) {
			params.push(`%${filters.search}%`);
			where.push(`(name ILIKE $${params.length} OR email ILIKE $${params.length} OR phone ILIKE $${params.length})`);
		}
		if (filters.is_active != null) {
			params.push(filters.is_active);
			where.push(`is_active = $${params.length}`);
		}
		const result = await this.pool.query<Customer>(
			`SELECT * FROM clients WHERE ${where.join(' AND ')} ORDER BY name${appendPagination(params, filters)}`,
			params
		);
		return result.rows;
	}

	async create(ctx: RepositoryContext, data: TenantCreateCustomerInput): Promise<Customer> {
		const result = await this.pool.query<Customer>(
			`INSERT INTO clients
				(company_id, name, document_id, phone, email, address, contact_person, notes, is_active)
			 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
			 RETURNING *`,
			[
				requireCompanyId(ctx), data.name, data.document_id || null, data.phone || null,
				data.email || null, data.address || null, data.contact_person || null,
				data.notes || null, data.is_active ?? 1
			]
		);
		return result.rows[0];
	}

	async update(ctx: RepositoryContext, id: ESRId, data: Partial<TenantCreateCustomerInput>): Promise<Customer> {
		const current = await this.findById(ctx, id);
		if (!current) throw new Error(`Customer ${id} not found in company.`);
		const next = { ...current, ...data };
		const result = await this.pool.query<Customer>(
			`UPDATE clients SET name = $3, document_id = $4, phone = $5, email = $6,
				address = $7, contact_person = $8, notes = $9, is_active = $10
			 WHERE company_id = $1 AND id = $2 RETURNING *`,
			[
				requireCompanyId(ctx), id, next.name, next.document_id || null, next.phone || null,
				next.email || null, next.address || null, next.contact_person || null,
				next.notes || null, next.is_active ?? 1
			]
		);
		return result.rows[0];
	}

	async deactivate(ctx: RepositoryContext, id: ESRId): Promise<void> {
		await this.pool.query('UPDATE clients SET is_active = 0 WHERE company_id = $1 AND id = $2', [
			requireCompanyId(ctx), id
		]);
	}
}

