import { RECORD_STATE } from '@esr/core';
import type { PageServerLoad } from './$types';
import { recordAuditLog } from '$lib/server/audit';
import { getCategoryRepository, getInventoryRepository } from '$lib/server/repositories';
import { requirePermission } from '$lib/server/permissions';
import { toTenantContext } from '$lib/server/tenant';

export const load: PageServerLoad = async (event) => {
	const { companyId } = requirePermission(event.locals, 'reports.view');
	const ctx = toTenantContext(companyId);
	const search = event.url.searchParams.get('search')?.trim() || undefined;
	const status = event.url.searchParams.get('status')?.trim() || undefined;
	const category = event.url.searchParams.get('category')?.trim() || undefined;

	const [items, categories] = await Promise.all([
		getInventoryRepository().list(ctx, {
			search,
			status,
			category_id: category,
			state: RECORD_STATE.ACTIVE,
			limit: 500,
			offset: 0
		}),
		getCategoryRepository().list(ctx)
	]);

	const categoryMap = new Map(categories.map((row) => [String(row.id), row.name]));

	await recordAuditLog(event, {
		action: 'report.viewed',
		entity_type: 'report',
		entity_id: 'inventory',
		description: 'Consulta reporte de inventario'
	});

	return {
		items: items.map((item) => {
			const total = Number(item.total_quantity ?? 0);
			const available = Number(item.available_quantity ?? 0);
			return {
				...item,
				category_name: item.category_id ? categoryMap.get(String(item.category_id)) ?? '—' : '—',
				committed_quantity: Math.max(0, total - available)
			};
		}),
		search: search ?? '',
		status: status ?? '',
		category: category ?? '',
		categories
	};
};
