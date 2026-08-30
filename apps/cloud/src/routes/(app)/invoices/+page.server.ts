import { parseRecordState } from '@esr/core';
import type { PageServerLoad } from './$types';
import { requirePermission } from '$lib/server/permissions';
import { getInvoiceRepository } from '$lib/server/repositories';
import { toTenantContext } from '$lib/server/tenant';

export const load: PageServerLoad = async ({ locals, url }) => {
	const { companyId } = requirePermission(locals, 'invoices.view');
	const ctx = toTenantContext(companyId);

	const search = url.searchParams.get('search')?.trim() || undefined;
	const status = url.searchParams.get('status')?.trim() || undefined;
	const state = parseRecordState(url.searchParams.get('state'));

	const invoices = await getInvoiceRepository().list(ctx, {
		search,
		status,
		state,
		limit: 100,
		offset: 0
	});

	return { invoices, search: search ?? '', status: status ?? '', state };
};
