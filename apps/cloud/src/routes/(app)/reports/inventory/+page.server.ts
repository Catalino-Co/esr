import type { PageServerLoad } from './$types';
import { recordAuditLog } from '$lib/server/audit';
import {
	getCategoryRepository,
	getCompanySettingsRepository,
	getInventoryRepository
} from '$lib/server/repositories';
import { requirePermission } from '$lib/server/permissions';
import { toTenantContext } from '$lib/server/tenant';

export const load: PageServerLoad = async (event) => {
	const { companyId } = requirePermission(event.locals, 'reports.view');
	const ctx = toTenantContext(companyId);
	const search = event.url.searchParams.get('search')?.trim() || undefined;
	const status = event.url.searchParams.get('status')?.trim() || undefined;
	const category = event.url.searchParams.get('category')?.trim() || undefined;

	// `listStock` y no `list`: este reporte habla de EXISTENCIAS —cuánto hay,
	// cuánto está comprometido, en qué condición— y desde la separación de
	// catálogo e inventario eso ya no vive en el artículo. Sin almacén, las
	// cifras son las de toda la empresa, que es lo que un reporte quiere.
	// Los ajustes PRIMERO: la regla de valoración es un parámetro de la consulta,
	// no un adorno de la cabecera. Pedirlas en paralelo dejaba el reporte
	// diciendo «promedio de las 3 últimas» sobre cifras calculadas con la última.
	const settings = await getCompanySettingsRepository().get(ctx);
	const valuationRule = settings?.default_valuation_rule === 'promedio3' ? 'promedio3' : 'ultimo';

	const [items, categories] = await Promise.all([
		getInventoryRepository().listStock(ctx, {
			search,
			physical_status: status,
			category_id: category,
			valuation_rule: valuationRule
		}),
		getCategoryRepository().list(ctx)
	]);

	await recordAuditLog(event, {
		action: 'report.viewed',
		entity_type: 'report',
		entity_id: 'inventory',
		description: 'Consulta reporte de inventario'
	});

	return {
		// `total`, `available` y `committed` los calcula ya el repositorio, con la
		// única cuenta que hay. Antes se restaban aquí dos columnas guardadas que
		// ninguna operación mantenía.
		// `category_name` ya viene de la consulta: la unía a mano un mapa que
		// repetía lo que el SQL ya sabía.
		items: items.map((item) => ({ ...item, category_name: item.category_name ?? '—' })),
		search: search ?? '',
		status: status ?? '',
		category: category ?? '',
		categories,
		valuationRule
	};
};
