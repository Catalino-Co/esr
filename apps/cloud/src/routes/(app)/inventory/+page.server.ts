import type { PageServerLoad } from './$types';
import { getCategoryRepository, getInventoryRepository } from '$lib/server/repositories';
import { requireCompany } from '$lib/server/require-auth';
import { toTenantContext } from '$lib/server/tenant';

export const load: PageServerLoad = async ({ locals, url }) => {
	const { companyId } = requireCompany(locals);
	const ctx = toTenantContext(companyId);
	const search = url.searchParams.get('search')?.trim() || undefined;
	const status = url.searchParams.get('status') || undefined;

	const [items, categories] = await Promise.all([
		getInventoryRepository().list(ctx, { search, status, limit: 100, offset: 0 }),
		getCategoryRepository().list(ctx)
	]);

	const categoryMap = new Map(categories.map((category) => [category.id, category.name]));

	return {
		items: items.map((item) => ({
			...item,
			category_name: item.category_id ? categoryMap.get(item.category_id) ?? '—' : '—'
		})),
		search: search ?? '',
		status: status ?? ''
	};
};
