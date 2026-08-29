import type { CatalogListOptions, RepositoryContext } from '@esr/core';
import { requireCompanyId } from '@esr/core';
import type { CategoryDraft, SubcategoryDraft, TenantCategoryRepository, TenantSubcategoryRepository } from '@esr/core';
import type { ESRId } from '@esr/schemas';
import type pg from 'pg';
import { getPostgresPool } from '../connection';
import { appendStateFilter } from './state-filter';

export class PostgresCategoryRepository implements TenantCategoryRepository {
	constructor(private readonly pool: pg.Pool = getPostgresPool()) {}

	async list(ctx: RepositoryContext, options: CatalogListOptions = {}): Promise<CategoryDraft[]> {
		const params: unknown[] = [requireCompanyId(ctx)];
		const where = ['company_id = $1'];
		appendStateFilter(params, where, options.state);
		const result = await this.pool.query<CategoryDraft>(
			`SELECT id, company_id, name, color, is_active
			 FROM categories
			 WHERE ${where.join(' AND ')}
			 ORDER BY name`,
			params
		);
		return result.rows;
	}

	/** Compara normalizando igual que el indice unico de la migracion 007. */
	async findByName(ctx: RepositoryContext, name: string): Promise<CategoryDraft | null> {
		const result = await this.pool.query<CategoryDraft>(
			`SELECT id, company_id, name, color, is_active
			 FROM categories
			 WHERE company_id = $1 AND LOWER(TRIM(name)) = LOWER(TRIM($2))`,
			[requireCompanyId(ctx), name]
		);
		return result.rows[0] ?? null;
	}

	/** Articulos de inventario que apuntan a esta categoria. */
	async countUsages(ctx: RepositoryContext, id: ESRId): Promise<number> {
		const result = await this.pool.query<{ total: string }>(
			'SELECT COUNT(*)::text AS total FROM items WHERE company_id = $1 AND category_id = $2',
			[requireCompanyId(ctx), id]
		);
		return Number(result.rows[0]?.total ?? 0);
	}

	async create(ctx: RepositoryContext, data: Omit<CategoryDraft, 'company_id'>): Promise<CategoryDraft> {
		const result = await this.pool.query<CategoryDraft>(
			`INSERT INTO categories (company_id, name, color, is_active)
			 VALUES ($1, $2, $3, $4)
			 RETURNING id, company_id, name, color, is_active`,
			[requireCompanyId(ctx), data.name, data.color || '#3158c9', data.is_active ?? 1]
		);
		return result.rows[0];
	}

	async update(ctx: RepositoryContext, id: ESRId, data: Omit<CategoryDraft, 'company_id'>): Promise<CategoryDraft> {
		const result = await this.pool.query<CategoryDraft>(
			`UPDATE categories SET name = $3, color = $4, is_active = $5
			 WHERE company_id = $1 AND id = $2
			 RETURNING id, company_id, name, color, is_active`,
			[requireCompanyId(ctx), id, data.name, data.color || '#3158c9', data.is_active ?? 1]
		);
		if (!result.rows[0]) throw new Error(`Category ${id} not found in company.`);
		return result.rows[0];
	}

	async setActive(ctx: RepositoryContext, id: ESRId, isActive: number): Promise<void> {
		await this.pool.query('UPDATE categories SET is_active = $3 WHERE company_id = $1 AND id = $2', [
			requireCompanyId(ctx), id, isActive
		]);
	}
}

export class PostgresSubcategoryRepository implements TenantSubcategoryRepository {
	constructor(private readonly pool: pg.Pool = getPostgresPool()) {}

	async list(
		ctx: RepositoryContext,
		categoryId?: ESRId,
		options: CatalogListOptions = {}
	): Promise<SubcategoryDraft[]> {
		const params: unknown[] = [requireCompanyId(ctx)];
		const where = ['company_id = $1'];
		appendStateFilter(params, where, options.state);
		if (categoryId) {
			params.push(categoryId);
			where.push(`category_id = $${params.length}`);
		}
		const result = await this.pool.query<SubcategoryDraft>(
			`SELECT id, company_id, category_id, name, is_active
			 FROM subcategories
			 WHERE ${where.join(' AND ')}
			 ORDER BY name`,
			params
		);
		return result.rows;
	}

	/** Una subcategoria solo tiene que ser unica dentro de su categoria. */
	async findByName(
		ctx: RepositoryContext,
		categoryId: ESRId,
		name: string
	): Promise<SubcategoryDraft | null> {
		const result = await this.pool.query<SubcategoryDraft>(
			`SELECT id, company_id, category_id, name, is_active
			 FROM subcategories
			 WHERE company_id = $1 AND category_id = $2 AND LOWER(TRIM(name)) = LOWER(TRIM($3))`,
			[requireCompanyId(ctx), categoryId, name]
		);
		return result.rows[0] ?? null;
	}

	async create(ctx: RepositoryContext, data: Omit<SubcategoryDraft, 'company_id'>): Promise<SubcategoryDraft> {
		const result = await this.pool.query<SubcategoryDraft>(
			`INSERT INTO subcategories (company_id, category_id, name, is_active)
			 VALUES ($1, $2, $3, $4)
			 RETURNING id, company_id, category_id, name, is_active`,
			[requireCompanyId(ctx), data.category_id, data.name, data.is_active ?? 1]
		);
		return result.rows[0];
	}

	async update(ctx: RepositoryContext, id: ESRId, data: Omit<SubcategoryDraft, 'company_id'>): Promise<SubcategoryDraft> {
		const result = await this.pool.query<SubcategoryDraft>(
			`UPDATE subcategories SET category_id = $3, name = $4, is_active = $5
			 WHERE company_id = $1 AND id = $2
			 RETURNING id, company_id, category_id, name, is_active`,
			[requireCompanyId(ctx), id, data.category_id, data.name, data.is_active ?? 1]
		);
		if (!result.rows[0]) throw new Error(`Subcategory ${id} not found in company.`);
		return result.rows[0];
	}

	async setActive(ctx: RepositoryContext, id: ESRId, isActive: number): Promise<void> {
		await this.pool.query('UPDATE subcategories SET is_active = $3 WHERE company_id = $1 AND id = $2', [
			requireCompanyId(ctx), id, isActive
		]);
	}
}
