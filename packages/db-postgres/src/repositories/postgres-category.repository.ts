import type { RepositoryContext } from '@esr/core';
import { requireCompanyId } from '@esr/core';
import type { CategoryDraft, SubcategoryDraft, TenantCategoryRepository, TenantSubcategoryRepository } from '@esr/core';
import type { ESRId } from '@esr/schemas';
import type pg from 'pg';
import { getPostgresPool } from '../connection';

export class PostgresCategoryRepository implements TenantCategoryRepository {
	constructor(private readonly pool: pg.Pool = getPostgresPool()) {}

	async list(ctx: RepositoryContext): Promise<CategoryDraft[]> {
		const result = await this.pool.query<CategoryDraft>(
			`SELECT id, company_id, name, color, is_active
			 FROM categories
			 WHERE company_id = $1 AND is_active = 1
			 ORDER BY name`,
			[requireCompanyId(ctx)]
		);
		return result.rows;
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

	async list(ctx: RepositoryContext, categoryId?: ESRId): Promise<SubcategoryDraft[]> {
		const params: unknown[] = [requireCompanyId(ctx)];
		const where = ['company_id = $1', 'is_active = 1'];
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
