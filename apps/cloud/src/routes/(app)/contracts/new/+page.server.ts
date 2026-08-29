import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { recordAuditLog } from '$lib/server/audit';
import { requirePermission } from '$lib/server/permissions';
import {
	getContractRepository,
	getCustomerRepository,
	getEventRepository,
	getQuoteRepository
} from '$lib/server/repositories';
import { toTenantContext } from '$lib/server/tenant';

/** Un contrato solo se genera desde una cotización aprobada o ya convertida. */
const ELIGIBLE_QUOTE_STATUS = ['aprobada', 'convertida'];

export const load: PageServerLoad = async ({ locals, url }) => {
	const { companyId } = requirePermission(locals, 'contracts.create');
	const ctx = toTenantContext(companyId);

	const quoteId = url.searchParams.get('quoteId');
	if (!quoteId) throw error(400, 'Falta la cotización de origen.');

	const quote = await getQuoteRepository().findById(ctx, quoteId);
	if (!quote) throw error(404, 'Cotización no encontrada.');

	if (!ELIGIBLE_QUOTE_STATUS.includes(String(quote.status))) {
		throw error(400, 'Solo se puede generar un contrato desde una cotización aprobada.');
	}

	// Una cotización tiene como mucho un contrato vigente; el índice único de la
	// migración 008 lo garantiza, pero conviene avisar antes de llegar ahí.
	const existing = await getContractRepository().findByQuotationId(ctx, quoteId);
	if (existing) throw redirect(303, `/contracts/${existing.id}`);

	const [customer, event, suggestedNumber] = await Promise.all([
		quote.client_id ? getCustomerRepository().findById(ctx, quote.client_id) : null,
		quote.event_id ? getEventRepository().findById(ctx, quote.event_id) : null,
		getContractRepository().nextNumber(ctx)
	]);

	return { quote, customer, event, suggestedNumber };
};

export const actions: Actions = {
	default: async (event) => {
		const { companyId } = requirePermission(event.locals, 'contracts.create');
		const ctx = toTenantContext(companyId);
		const form = await event.request.formData();

		const quoteId = String(form.get('quotation_id') ?? '').trim();
		if (!quoteId) return fail(400, { error: 'Falta la cotización de origen.' });

		const quote = await getQuoteRepository().findById(ctx, quoteId);
		if (!quote) return fail(404, { error: 'Cotización no encontrada.' });
		if (!ELIGIBLE_QUOTE_STATUS.includes(String(quote.status))) {
			return fail(400, { error: 'Solo se puede generar un contrato desde una cotización aprobada.' });
		}

		const existing = await getContractRepository().findByQuotationId(ctx, quoteId);
		if (existing) {
			return fail(400, { error: `Esa cotización ya tiene el contrato ${existing.number}.` });
		}

		const values = {
			date: String(form.get('date') ?? '').trim() || new Date().toISOString().slice(0, 10),
			terms: String(form.get('terms') ?? '').trim() || null,
			notes: String(form.get('notes') ?? '').trim() || null
		};

		const contract = await getContractRepository().create(ctx, {
			client_id: quote.client_id,
			event_id: quote.event_id,
			quotation_id: quoteId,
			number: await getContractRepository().nextNumber(ctx),
			status: 'borrador',
			...values
		});

		await recordAuditLog(event, {
			action: 'contract.created',
			entity_type: 'contract',
			entity_id: String(contract.id),
			description: `Contrato creado: ${contract.number} desde ${quote.quote_number ?? `#${quoteId}`}`
		});

		throw redirect(303, `/contracts/${contract.id}`);
	}
};
