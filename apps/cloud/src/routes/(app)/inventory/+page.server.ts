import { parseRecordState } from '@esr/core';
import type { PageServerLoad } from './$types';
import { getCategoryRepository, getInventoryRepository } from '$lib/server/repositories';
import { requirePermission } from '$lib/server/permissions';
import { toTenantContext } from '$lib/server/tenant';

export const load: PageServerLoad = async ({ locals, url }) => {
	const { companyId } = requirePermission(locals, 'inventory.view');
	const ctx = toTenantContext(companyId);
	const search = url.searchParams.get('search')?.trim() || undefined;
	const status = url.searchParams.get('status') || undefined;
	const categoryId = url.searchParams.get('category')?.trim() || undefined;
	const state = parseRecordState(url.searchParams.get('state'));

	const [items, categories] = await Promise.all([
		getInventoryRepository().list(ctx, { search, status, state, category_id: categoryId, limit: 100, offset: 0 }),
		getCategoryRepository().list(ctx)
	]);

	const categoryMap = new Map(categories.map((category) => [category.id, category.name]));

	return {
		items: items.map((item) => ({
			...item,
			category_name: item.category_id ? categoryMap.get(item.category_id) ?? '—' : '—'
		})),
		// Las categorias alimentan el select de la barra, que antes no existia
		// aunque el repositorio ya soportaba filtrar por ellas.
		categories,
		search: search ?? '',
		status: status ?? '',
		state,
		categoryId: categoryId ?? ''
	};
};
