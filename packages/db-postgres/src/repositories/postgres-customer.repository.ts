import type { CustomerListFilters, RecordState, RepositoryContext, TenantCreateCustomerInput, TenantCustomerRepository } from '@esr/core';
import { DEFAULT_RECORD_STATE, requireCompanyId } from '@esr/core';
import type { Customer, ESRId } from '@esr/schemas';
import type pg from 'pg';
import { getPostgresPool } from '../connection';
import { appendStateFilter } from './state-filter';
import { appendPagination } from './pagination';

/**
 * OJO al agregar un campo: `findById` y `list` hacen `SELECT *`, asi que una
 * columna nueva se LEE sola. Escribirla, no: el INSERT y el UPDATE de abajo
 * enumeran sus columnas. Si se agrega al formulario, al validador y al tipo
 * pero no aqui, la pantalla postea, valida, responde «Cambios guardados» y no
 * persiste nada — y como lo que ya existia si se ve, el fallo no parece un
 * fallo de guardado.
 */
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
		// Sin estado explicito se listan solo los activos.
		appendStateFilter(params, where, filters.state);
		const result = await this.pool.query<Customer>(
			`SELECT * FROM clients WHERE ${where.join(' AND ')} ORDER BY name${appendPagination(params, filters)}`,
			params
		);
		return result.rows;
	}

	async create(ctx: RepositoryContext, data: TenantCreateCustomerInput): Promise<Customer> {
		const result = await this.pool.query<Customer>(
			`INSERT INTO clients
				(company_id, name, document_id, document_type, payment_terms, sector_id,
				 phone, email, address, contact_person, notes, is_active)
			 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
			 RETURNING *`,
			[
				requireCompanyId(ctx), data.name, data.document_id || null,
				data.document_type || null, data.payment_terms || null, data.sector_id || null,
				data.phone || null, data.email || null, data.address || null,
				data.contact_person || null, data.notes || null, data.is_active ?? 1
			]
		);
		return result.rows[0];
	}

	async update(ctx: RepositoryContext, id: ESRId, data: Partial<TenantCreateCustomerInput>): Promise<Customer> {
		const current = await this.findById(ctx, id);
		if (!current) throw new Error(`Customer ${id} not found in company.`);
		const next = { ...current, ...data };
		const result = await this.pool.query<Customer>(
			`UPDATE clients SET name = $3, document_id = $4, document_type = $5,
				payment_terms = $6, sector_id = $7, phone = $8, email = $9,
				address = $10, contact_person = $11, notes = $12, is_active = $13
			 WHERE company_id = $1 AND id = $2 RETURNING *`,
			[
				requireCompanyId(ctx), id, next.name, next.document_id || null,
				next.document_type || null, next.payment_terms || null, next.sector_id || null,
				next.phone || null, next.email || null, next.address || null,
				next.contact_person || null, next.notes || null, next.is_active ?? 1
			]
		);
		return result.rows[0];
	}

	async setState(ctx: RepositoryContext, id: ESRId, state: RecordState): Promise<void> {
		await this.pool.query(
			'UPDATE clients SET is_active = $3 WHERE company_id = $1 AND id = $2',
			[requireCompanyId(ctx), id, state]
		);
	}
}

