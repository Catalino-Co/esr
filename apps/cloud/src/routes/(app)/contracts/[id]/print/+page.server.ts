import { error } from '@sveltejs/kit';
import { summarizePayments } from '@esr/core';
import { renderContractDocument } from '@esr/reports/documents';
import type { PageServerLoad } from './$types';
import { recordAuditLog } from '$lib/server/audit';
import { requirePermission } from '$lib/server/permissions';
import {
	getCompanyDocumentInfo,
	getContractRepository,
	getPaymentRepository
} from '$lib/server/repositories';
import { toTenantContext } from '$lib/server/tenant';

export const load: PageServerLoad = async (event) => {
	const { companyId } = requirePermission(event.locals, 'contracts.view');
	const ctx = toTenantContext(companyId);

	const contract = await getContractRepository().findById(ctx, event.params.id);
	if (!contract) error(404, 'Contrato no encontrado');

	const payments = contract.quotation_id
		? await getPaymentRepository().listForQuotation(ctx, contract.quotation_id)
		: await getPaymentRepository().list(ctx, { contract_id: event.params.id });

	const company = await getCompanyDocumentInfo(ctx);

	await recordAuditLog(event, {
		action: 'document.printed',
		entity_type: 'contract',
		entity_id: String(contract.id),
		description: `Impresión de contrato ${contract.number || contract.id}`,
		metadata: { contractNumber: contract.number }
	});

	return {
		html: renderContractDocument({
			company,
			contract,
			payments,
			summary: summarizePayments(contract.quote_total, payments)
		}),
		backHref: `/contracts/${event.params.id}`,
		title: `Contrato ${contract.number || contract.id}`
	};
};
