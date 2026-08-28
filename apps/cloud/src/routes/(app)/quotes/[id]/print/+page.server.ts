import { error } from '@sveltejs/kit';
import { renderQuoteDocument } from '@esr/reports/documents';
import type { PageServerLoad } from './$types';
import { recordAuditLog } from '$lib/server/audit';
import {
	getCompanyDocumentInfo,
	getCustomerRepository,
	getEventRepository,
	getQuoteRepository
} from '$lib/server/repositories';
import { requirePermission } from '$lib/server/permissions';
import { toTenantContext } from '$lib/server/tenant';

export const load: PageServerLoad = async (event) => {
	const { companyId } = requirePermission(event.locals, 'quotes.view');
	const ctx = toTenantContext(companyId);

	const quote = await getQuoteRepository().findById(ctx, event.params.id);
	if (!quote) error(404, 'Cotización no encontrada');

	const [items, customer, eventRow, company] = await Promise.all([
		getQuoteRepository().listItems(ctx, event.params.id),
		getCustomerRepository().findById(ctx, quote.client_id),
		quote.event_id ? getEventRepository().findById(ctx, quote.event_id) : Promise.resolve(null),
		getCompanyDocumentInfo(ctx)
	]);

	await recordAuditLog(event, {
		action: 'document.printed',
		entity_type: 'quote',
		entity_id: String(quote.id),
		description: `Impresión de cotización ${quote.quote_number || quote.id}`,
		metadata: { quoteNumber: quote.quote_number }
	});

	return {
		html: renderQuoteDocument({ company, quote, customer, event: eventRow, items }),
		backHref: `/quotes/${event.params.id}`,
		title: `Cotización ${quote.quote_number || quote.id}`
	};
};
