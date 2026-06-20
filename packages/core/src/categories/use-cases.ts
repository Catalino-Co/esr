import { fail, ok, type UseCaseResult } from '../shared/result';
import type { CategoryDraft, SubcategoryDraft } from './repositories';

export function validateCategoryDraft(input: Pick<CategoryDraft, 'name'>): UseCaseResult<Pick<CategoryDraft, 'name'>> {
	return input.name?.trim() ? ok(input) : fail('category.name.required');
}

export function validateSubcategoryDraft(input: Pick<SubcategoryDraft, 'category_id' | 'name'>): UseCaseResult<Pick<SubcategoryDraft, 'category_id' | 'name'>> {
	return input.category_id && input.name?.trim() ? ok(input) : fail('subcategory.required_fields');
}
