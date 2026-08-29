import type { PageServerLoad } from './$types';
import { summarizePayments } from '@esr/core';
import { requirePermission } from '$lib/server/permissions';
import { getContractRepository, getPaymentRepository } from '$lib/server/repositories';
import { toTenantContext } from '$lib/server/tenant';

export const load: PageServerLoad = async ({ locals, url }) => {
	const { companyId } = requirePermission(locals, 'contracts.view');
	const ctx = toTenantContext(companyId);

	const status = url.searchParams.get('status') ?? '';
	const search = url.searchParams.get('search') ?? '';

	const contracts = await getContractRepository().list(ctx, {
		status: status || undefined,
		search: search || undefined
	});

	// El saldo de cada contrato sale de su cotización menos lo cobrado. Se
	// resuelve por contrato en vez de con un JOIN agregado porque la regla de
	// qué pago cuenta vive en core, no en SQL.
	const rows = await Promise.all(
		contracts.map(async (contract) => {
			const payments = contract.quotation_id
				? await getPaymentRepository().listForQuotation(ctx, contract.quotation_id)
				: await getPaymentRepository().list(ctx, { contract_id: contract.id ?? undefined });
			return { ...contract, summary: summarizePayments(contract.quote_total, payments) };
		})
	);

	return { contracts: rows, status, search };
};
