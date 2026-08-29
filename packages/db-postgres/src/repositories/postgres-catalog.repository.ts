import type {
	CatalogListOptions,
	CollaboratorDraft,
	EventTypeDraft,
	RepositoryContext,
	SupplierDraft,
	TenantCollaboratorRepository,
	TenantEventTypeRepository,
	TenantSupplierRepository
} from '@esr/core';
import { requireCompanyId } from '@esr/core';
import type { ESRId } from '@esr/schemas';
import type pg from 'pg';
import { getPostgresPool } from '../connection';

/**
 * Base comun de los catalogos simples. Las tres tablas se consultan igual y
 * solo cambian sus columnas, asi que la unica diferencia entre subclases es la
 * lista de campos y como se arma el INSERT/UPDATE.
 *
 * Ninguna expone borrado: los registros historicos (eventos, ordenes) apuntan
 * a estas filas por id, asi que solo se desactivan.
 */
abstract class PostgresCatalogRepository<TDraft extends { id?: ESRId | null; name: string }> {
	constructor(private readonly pool: pg.Pool = getPostgresPool()) {}

	protected abstract readonly table: string;
	/** Columnas que se leen, en el orden en que se devuelven. */
	protected abstract readonly columns: string;
	/** Columnas editables, sin company_id ni id. */
	protected abstract readonly fields: string[];
	/** Valores de esas columnas, en el mismo orden. */
	protected abstract values(data: Omit<TDraft, 'id' | 'company_id'>): unknown[];
	/**
	 * Consulta que cuenta cuantos registros operativos usan esta entrada.
	 * `$1` es el company_id y `$2` el id de la entrada.
	 */
	protected abstract readonly usageQuery: string | null;

	protected db(): pg.Pool {
		return this.pool;
	}

	async list(ctx: RepositoryContext, options: CatalogListOptions = {}): Promise<TDraft[]> {
		const where = ['company_id = $1'];
		if (!options.includeInactive) where.push('is_active = 1');
		const result = await this.pool.query<TDraft>(
			`SELECT ${this.columns}
			 FROM ${this.table}
			 WHERE ${where.join(' AND ')}
			 ORDER BY is_active DESC, name`,
			[requireCompanyId(ctx)]
		);
		return result.rows;
	}

	async findById(ctx: RepositoryContext, id: ESRId): Promise<TDraft | null> {
		const result = await this.pool.query<TDraft>(
			`SELECT ${this.columns} FROM ${this.table} WHERE company_id = $1 AND id = $2`,
			[requireCompanyId(ctx), id]
		);
		return result.rows[0] ?? null;
	}

	/** Compara normalizando igual que el indice unico de la migracion 007. */
	async findByName(ctx: RepositoryContext, name: string): Promise<TDraft | null> {
		const result = await this.pool.query<TDraft>(
			`SELECT ${this.columns}
			 FROM ${this.table}
			 WHERE company_id = $1 AND LOWER(TRIM(name)) = LOWER(TRIM($2))`,
			[requireCompanyId(ctx), name]
		);
		return result.rows[0] ?? null;
	}

	async create(ctx: RepositoryContext, data: Omit<TDraft, 'id' | 'company_id'>): Promise<TDraft> {
		const values = this.values(data);
		const placeholders = values.map((_, i) => `$${i + 2}`).join(', ');
		const result = await this.pool.query<TDraft>(
			`INSERT INTO ${this.table} (company_id, ${this.fields.join(', ')})
			 VALUES ($1, ${placeholders})
			 RETURNING ${this.columns}`,
			[requireCompanyId(ctx), ...values]
		);
		return result.rows[0];
	}

	async update(
		ctx: RepositoryContext,
		id: ESRId,
		data: Omit<TDraft, 'id' | 'company_id'>
	): Promise<TDraft> {
		const values = this.values(data);
		const assignments = this.fields.map((field, i) => `${field} = $${i + 3}`).join(', ');
		const result = await this.pool.query<TDraft>(
			`UPDATE ${this.table} SET ${assignments}
			 WHERE company_id = $1 AND id = $2
			 RETURNING ${this.columns}`,
			[requireCompanyId(ctx), id, ...values]
		);
		if (!result.rows[0]) throw new Error(`${this.table} ${id} no existe en esta empresa.`);
		return result.rows[0];
	}

	async setActive(ctx: RepositoryContext, id: ESRId, isActive: number): Promise<void> {
		await this.pool.query(
			`UPDATE ${this.table} SET is_active = $3 WHERE company_id = $1 AND id = $2`,
			[requireCompanyId(ctx), id, isActive]
		);
	}

	async countUsages(ctx: RepositoryContext, id: ESRId): Promise<number> {
		if (!this.usageQuery) return 0;
		const result = await this.pool.query<{ total: string }>(this.usageQuery, [
			requireCompanyId(ctx),
			id
		]);
		return Number(result.rows[0]?.total ?? 0);
	}
}

export class PostgresEventTypeRepository
	extends PostgresCatalogRepository<EventTypeDraft>
	implements TenantEventTypeRepository
{
	protected readonly table = 'event_types';
	protected readonly columns = 'id, company_id, name, color, description, is_active';
	protected readonly fields = ['name', 'color', 'description', 'is_active'];

	// `events.event_type` guarda el NOMBRE, no el id: por eso el conteo compara
	// contra el nombre del tipo en vez de una clave foranea.
	protected readonly usageQuery = `
		SELECT COUNT(*)::text AS total
		FROM events e
		WHERE e.company_id = $1
		  AND LOWER(TRIM(e.event_type)) = (
			SELECT LOWER(TRIM(name)) FROM event_types WHERE company_id = $1 AND id = $2
		  )`;

	protected values(data: Omit<EventTypeDraft, 'id' | 'company_id'>): unknown[] {
		return [
			data.name.trim(),
			data.color || '#6366f1',
			data.description ?? null,
			data.is_active ?? 1
		];
	}
}

export class PostgresSupplierRepository
	extends PostgresCatalogRepository<SupplierDraft>
	implements TenantSupplierRepository
{
	protected readonly table = 'suppliers';
	protected readonly columns = 'id, company_id, name, contact, phone, email, service, notes, is_active';
	protected readonly fields = ['name', 'contact', 'phone', 'email', 'service', 'notes', 'is_active'];

	// Ninguna tabla operativa referencia proveedores todavia.
	protected readonly usageQuery = null;

	protected values(data: Omit<SupplierDraft, 'id' | 'company_id'>): unknown[] {
		return [
			data.name.trim(),
			data.contact ?? null,
			data.phone ?? null,
			data.email ?? null,
			data.service ?? null,
			data.notes ?? null,
			data.is_active ?? 1
		];
	}
}

export class PostgresCollaboratorRepository
	extends PostgresCatalogRepository<CollaboratorDraft>
	implements TenantCollaboratorRepository
{
	protected readonly table = 'collaborators';
	protected readonly columns = 'id, company_id, name, phone, email, role, notes, is_active';
	protected readonly fields = ['name', 'phone', 'email', 'role', 'notes', 'is_active'];

	// Ninguna tabla operativa referencia colaboradores todavia.
	protected readonly usageQuery = null;

	protected values(data: Omit<CollaboratorDraft, 'id' | 'company_id'>): unknown[] {
		return [
			data.name.trim(),
			data.phone ?? null,
			data.email ?? null,
			data.role ?? null,
			data.notes ?? null,
			data.is_active ?? 1
		];
	}
}
