import type { RequestHandler } from './$types';
import { toCsv } from '$lib/server/csv';
import { getCompanySettingsRepository, getInventoryRepository } from '$lib/server/repositories';
import { requirePermission } from '$lib/server/permissions';
import { toTenantContext } from '$lib/server/tenant';

export const GET: RequestHandler = async ({ locals, url }) => {
	const { companyId } = requirePermission(locals, 'reports.view');
	const ctx = toTenantContext(companyId);
	const search = url.searchParams.get('search')?.trim() || undefined;
	const status = url.searchParams.get('status')?.trim() || undefined;
	const category = url.searchParams.get('category')?.trim() || undefined;

	// Las mismas columnas y el mismo origen que la pantalla: si el reporte y su
	// CSV leyeran de sitios distintos acabarían diciendo cosas distintas.
	// La misma regla de valoración que la pantalla: si el CSV usara otra, el
	// mismo reporte daría dos valores distintos según cómo se mirara.
	const settings = await getCompanySettingsRepository().get(ctx);
	const valuationRule = settings?.default_valuation_rule === 'promedio3' ? 'promedio3' : 'ultimo';

	const items = await getInventoryRepository().listStock(ctx, {
		search,
		physical_status: status,
		category_id: category,
		valuation_rule: valuationRule
	});

	const rows = items.map((item) => [
		item.name,
		item.internal_code ?? '',
		item.category_name ?? '',
		Number(item.total_quantity ?? 0),
		Number(item.available_quantity ?? 0),
		Number(item.committed_quantity ?? 0),
		Number(item.min_stock ?? 0),
		item.physical_status ?? '',
		// Vacio y no cero cuando no hay costo: las entradas anteriores a esta
		// reforma no lo guardaban, y un cero seria inventarselo.
		item.valuation_cost == null
			? ''
			: Number(item.valuation_cost) * Number(item.total_quantity ?? 0)
	]);

	const csv = toCsv(
		['Articulo', 'SKU', 'Categoria', 'Total', 'Disponible', 'Comprometido', 'Minimo', 'Condicion', 'Valor'],
		rows
	);

	return new Response(csv, {
		headers: {
			'Content-Type': 'text/csv; charset=utf-8',
			'Content-Disposition': 'attachment; filename="inventario.csv"'
		}
	});
};
