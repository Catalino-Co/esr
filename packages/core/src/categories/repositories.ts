import type { ESRId } from '@esr/schemas';
import type { CatalogListOptions } from '../catalogs/repositories';
import type { RepositoryContext } from '../shared/tenant';

export type CategoryDraft = { id?: ESRId | null; company_id?: string; name: string; color?: string; is_active?: number };
export type SubcategoryDraft = { id?: ESRId | null; company_id?: string; category_id: ESRId; name: string; is_active?: number };

export interface CategoryRepository {
	create(data: CategoryDraft): Promise<CategoryDraft>;
	update(id: ESRId, data: CategoryDraft): Promise<CategoryDraft>;
	setActive(id: ESRId, isActive: number): Promise<void>;
}

export interface SubcategoryRepository {
	create(data: SubcategoryDraft): Promise<SubcategoryDraft>;
	update(id: ESRId, data: SubcategoryDraft): Promise<SubcategoryDraft>;
	setActive(id: ESRId, isActive: number): Promise<void>;
}

export interface TenantCategoryRepository {
	list(ctx: RepositoryContext, options?: CatalogListOptions): Promise<CategoryDraft[]>;
	findByName(ctx: RepositoryContext, name: string): Promise<CategoryDraft | null>;
	countUsages(ctx: RepositoryContext, id: ESRId): Promise<number>;
	create(ctx: RepositoryContext, data: Omit<CategoryDraft, 'company_id'>): Promise<CategoryDraft>;
	update(ctx: RepositoryContext, id: ESRId, data: Omit<CategoryDraft, 'company_id'>): Promise<CategoryDraft>;
	setActive(ctx: RepositoryContext, id: ESRId, isActive: number): Promise<void>;
}

export interface TenantSubcategoryRepository {
	list(
		ctx: RepositoryContext,
		categoryId?: ESRId,
		options?: CatalogListOptions
	): Promise<SubcategoryDraft[]>;
	findByName(
		ctx: RepositoryContext,
		categoryId: ESRId,
		name: string
	): Promise<SubcategoryDraft | null>;
	create(ctx: RepositoryContext, data: Omit<SubcategoryDraft, 'company_id'>): Promise<SubcategoryDraft>;
	update(ctx: RepositoryContext, id: ESRId, data: Omit<SubcategoryDraft, 'company_id'>): Promise<SubcategoryDraft>;
	setActive(ctx: RepositoryContext, id: ESRId, isActive: number): Promise<void>;
}
