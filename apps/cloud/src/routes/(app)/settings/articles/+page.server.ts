import { parseRecordState } from '@esr/core';
import type { PageServerLoad } from './$types';
import {
	getCategoryRepository,
	getInventoryRepository,
	getSupplierRepository,
	getUnitOfMeasureRepository
} from '$lib/server/repositories';
import { requirePermission } from '$lib/server/permissions';
import { toTenantContext } from '$lib/server/tenant';

/**
 * El CATALOGO de artículos: qué existe, cómo se llama, quién lo suministra y en
 * qué estado de circulación está.
 *
 * Separado de Inventario, que responde a otra pregunta —cuánto hay y dónde—.
 * Aquí viven el alta, la baja y el archivado; allí no, porque activar o
 * archivar cosas no es algo que se haga mirando existencias.
 */
export const load: PageServerLoad = async ({ locals, url }) => {
	const { companyId } = requirePermission(locals, 'inventory.view');
	const ctx = toTenantContext(companyId);
	const search = url.searchParams.get('search')?.trim() || undefined;
	const categoryId = url.searchParams.get('category')?.trim() || undefined;
	const state = parseRecordState(url.searchParams.get('state'));

	const [items, categories, suppliers, units] = await Promise.all([
		getInventoryRepository().list(ctx, { search, state, category_id: categoryId, limit: 200, offset: 0 }),
		getCategoryRepository().list(ctx),
		getSupplierRepository().list(ctx),
		getUnitOfMeasureRepository().list(ctx)
	]);

	const categoryMap = new Map(categories.map((c) => [String(c.id), c.name]));
	const supplierMap = new Map(suppliers.map((s) => [String(s.id), s.name]));
	const unitMap = new Map(units.map((u) => [String(u.id), u.abbr || u.name]));

	return {
		items: items.map((item) => ({
			...item,
			category_name: item.category_id ? categoryMap.get(String(item.category_id)) ?? '—' : '—',
			supplier_name: item.supplier_id ? supplierMap.get(String(item.supplier_id)) ?? '—' : '—',
			uom_abbr: item.uom_id ? unitMap.get(String(item.uom_id)) ?? '' : ''
		})),
		categories,
		search: search ?? '',
		state,
		categoryId: categoryId ?? ''
	};
};
