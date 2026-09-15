import type { PageServerLoad } from './$types';
import { recordAuditLog } from '$lib/server/audit';
import {
	getCategoryRepository,
	getCompanyDocumentInfo,
	getInventoryRepository
} from '$lib/server/repositories';
import { requirePermission } from '$lib/server/permissions';
import { toTenantContext } from '$lib/server/tenant';
import { createCatalogReportRows, groupCatalogRows } from '@esr/reports/catalog';

/**
 * Reporte › Catálogo de productos.
 *
 * Lista de precios por categoría/subcategoría, no un inventario: solo
 * artículos activos, sin ninguna columna de existencias. `createCatalogReportRows`
 * y `groupCatalogRows` son transforms puros (sin jsPDF ni Blob), así que se
 * importan estático y corren bien en SSR — a diferencia de los generadores de
 * Excel/PDF, que la página importa dinámico solo cuando el usuario pide
 * exportar.
 */
export const load: PageServerLoad = async (event) => {
	const { companyId } = requirePermission(event.locals, 'reports.view');
	const ctx = toTenantContext(companyId);
	const search = event.url.searchParams.get('search')?.trim() || undefined;
	const category = event.url.searchParams.get('category')?.trim() || undefined;

	const [items, categories, companyInfo] = await Promise.all([
		getInventoryRepository().listCatalog(ctx, { search, category_id: category }),
		getCategoryRepository().list(ctx),
		getCompanyDocumentInfo(ctx)
	]);

	await recordAuditLog(event, {
		action: 'report.viewed',
		entity_type: 'report',
		entity_id: 'catalog',
		description: 'Consulta catálogo de productos'
	});

	const rows = createCatalogReportRows(items);
	return {
		rows,
		groups: groupCatalogRows(rows),
		search: search ?? '',
		category: category ?? '',
		categories,
		companyInfo
	};
};
