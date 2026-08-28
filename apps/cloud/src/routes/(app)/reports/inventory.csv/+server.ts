import type { RequestHandler } from './$types';
import { toCsv } from '$lib/server/csv';
import { getCategoryRepository, getInventoryRepository } from '$lib/server/repositories';
import { requirePermission } from '$lib/server/permissions';
import { toTenantContext } from '$lib/server/tenant';

export const GET: RequestHandler = async ({ locals, url }) => {
	const { companyId } = requirePermission(locals, 'reports.view');
	const ctx = toTenantContext(companyId);
	const search = url.searchParams.get('search')?.trim() || undefined;
	const status = url.searchParams.get('status')?.trim() || undefined;
	const category = url.searchParams.get('category')?.trim() || undefined;

	const [items, categories] = await Promise.all([
		getInventoryRepository().list(ctx, {
			search,
			status,
			category_id: category,
			is_active: 1,
			limit: 5000,
			offset: 0
		}),
		getCategoryRepository().list(ctx)
	]);
	const categoryMap = new Map(categories.map((row) => [String(row.id), row.name]));

	const rows = items.map((item) => {
		const total = Number(item.total_quantity ?? 0);
		const available = Number(item.available_quantity ?? 0);
		return [
			item.name,
			item.internal_code ?? '',
			item.category_id ? categoryMap.get(String(item.category_id)) ?? '' : '',
			total,
			available,
			Math.max(0, total - available),
			item.status ?? ''
		];
	});

	const csv = toCsv(
		['Articulo', 'SKU', 'Categoria', 'Total', 'Disponible', 'Comprometido', 'Estado'],
		rows
	);

	return new Response(csv, {
		headers: {
			'Content-Type': 'text/csv; charset=utf-8',
			'Content-Disposition': 'attachment; filename="inventario.csv"'
		}
	});
};
