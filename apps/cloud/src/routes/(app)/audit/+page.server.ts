import type { PageServerLoad } from './$types';
import { getAuditLogRepository } from '$lib/server/repositories';
import { requireCompany } from '$lib/server/require-auth';
import { toTenantContext } from '$lib/server/tenant';

export const load: PageServerLoad = async ({ locals, url }) => {
	const { companyId } = requireCompany(locals);
	const ctx = toTenantContext(companyId);
	const action = url.searchParams.get('action')?.trim() || undefined;
	const entityType = url.searchParams.get('entityType')?.trim() || undefined;
	const dateFrom = url.searchParams.get('dateFrom')?.trim() || undefined;
	const dateTo = url.searchParams.get('dateTo')?.trim() || undefined;

	const logs = await getAuditLogRepository().list(ctx, {
		action,
		entity_type: entityType,
		date_from: dateFrom,
		date_to: dateTo ? `${dateTo}T23:59:59` : undefined,
		limit: 200,
		offset: 0
	});

	return {
		logs,
		action: action ?? '',
		entityType: entityType ?? '',
		dateFrom: dateFrom ?? '',
		dateTo: dateTo ?? ''
	};
};
