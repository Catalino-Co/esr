import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { validateAddQuoteItemInput } from '@esr/schemas';
import { validateQuoteCanApprove, validateQuoteCanEdit } from '@esr/core';
import {
	getCustomerRepository,
	getEventRepository,
	getInventoryRepository,
	getQuoteConversionService,
	getQuoteRepository,
	getRentalRepository
} from '$lib/server/repositories';
import { requireCompany } from '$lib/server/require-auth';
import { toTenantContext } from '$lib/server/tenant';

export const load: PageServerLoad = async ({ locals, params }) => {
	const { companyId } = requireCompany(locals);
	const ctx = toTenantContext(companyId);

	const quote = await getQuoteRepository().findById(ctx, params.id);
	if (!quote) error(404, 'Cotización no encontrada');

	const [items, event, customer, inventory, linkedOrder] = await Promise.all([
		getQuoteRepository().listItems(ctx, params.id),
		quote.event_id ? getEventRepository().findById(ctx, quote.event_id) : Promise.resolve(null),
		getCustomerRepository().findById(ctx, quote.client_id),
		getInventoryRepository().list(ctx, { is_active: 1, limit: 200, offset: 0 }),
		getRentalRepository().findByQuotationId(ctx, params.id)
	]);

	return { quote, items, event, customer, inventory, linkedOrder, canEdit: quote.status !== 'convertida' && quote.status !== 'cancelada' };
};

export const actions: Actions = {
	addItem: async ({ request, locals, params }) => {
		const { companyId } = requireCompany(locals);
		const ctx = toTenantContext(companyId);
		const quote = await getQuoteRepository().findById(ctx, params.id);
		if (!quote) error(404, 'Cotización no encontrada');
		const editCheck = validateQuoteCanEdit(quote);
		if (!editCheck.ok) return fail(400, { error: editCheck.error });

		const form = await request.formData();
		const item_id = String(form.get('item_id') ?? '').trim();
		const quantity = Number(form.get('quantity') ?? 1);
		const price = Number(form.get('price') ?? 0);

		const validation = validateAddQuoteItemInput({ item_id, quantity, price });
		if (!validation.valid) return fail(400, { error: 'Artículo, cantidad y precio inválidos.' });

		await getQuoteRepository().addItem(ctx, params.id, { item_id, quantity, price });
		return { success: true };
	},
	updateItem: async ({ request, locals, params }) => {
		const { companyId } = requireCompany(locals);
		const ctx = toTenantContext(companyId);
		const quote = await getQuoteRepository().findById(ctx, params.id);
		if (!quote) error(404, 'Cotización no encontrada');
		const editCheck = validateQuoteCanEdit(quote);
		if (!editCheck.ok) return fail(400, { error: editCheck.error });

		const form = await request.formData();
		const itemId = String(form.get('itemId') ?? '').trim();
		const quantity = Number(form.get('quantity') ?? 1);
		const price = Number(form.get('price') ?? 0);
		if (!itemId || quantity <= 0 || price < 0) return fail(400, { error: 'Datos de línea inválidos.' });

		await getQuoteRepository().updateItem(ctx, params.id, itemId, { quantity, price });
		return { success: true };
	},
	removeItem: async ({ request, locals, params }) => {
		const { companyId } = requireCompany(locals);
		const ctx = toTenantContext(companyId);
		const quote = await getQuoteRepository().findById(ctx, params.id);
		if (!quote) error(404, 'Cotización no encontrada');
		const editCheck = validateQuoteCanEdit(quote);
		if (!editCheck.ok) return fail(400, { error: editCheck.error });

		const form = await request.formData();
		const itemId = String(form.get('itemId') ?? '').trim();
		if (!itemId) return fail(400, { error: 'Línea no especificada.' });
		await getQuoteRepository().removeItem(ctx, params.id, itemId);
		return { success: true };
	},
	updateQuote: async ({ request, locals, params }) => {
		const { companyId } = requireCompany(locals);
		const ctx = toTenantContext(companyId);
		const quote = await getQuoteRepository().findById(ctx, params.id);
		if (!quote) error(404, 'Cotización no encontrada');
		const editCheck = validateQuoteCanEdit(quote);
		if (!editCheck.ok) return fail(400, { error: editCheck.error });

		const form = await request.formData();
		const discount = Number(form.get('discount') ?? 0);
		const tax_amount = Number(form.get('tax_amount') ?? 0);
		const notes = String(form.get('notes') ?? '').trim();

		await getQuoteRepository().update(ctx, params.id, { notes, discount, tax_amount });
		await getQuoteRepository().syncTotals(ctx, params.id);
		return { success: true };
	},
	approve: async ({ locals, params }) => {
		const { companyId } = requireCompany(locals);
		const ctx = toTenantContext(companyId);
		const quote = await getQuoteRepository().findById(ctx, params.id);
		if (!quote) error(404, 'Cotización no encontrada');
		const items = await getQuoteRepository().listItems(ctx, params.id);
		const approval = validateQuoteCanApprove(quote, items);
		if (!approval.ok) return fail(400, { error: approval.error });

		for (const item of items) {
			if (!item.item_id) continue;
			const check = await getQuoteRepository().checkAvailability(
				ctx,
				item.item_id,
				Number(item.quantity || 0),
				item.start_date || quote.date || undefined,
				item.end_date || undefined
			);
			if (!check.ok) {
				return fail(400, {
					error: `Disponibilidad insuficiente para ${item.name}: necesita ${item.quantity}, disponible ${check.available}.`
				});
			}
		}

		await getQuoteRepository().changeStatus(ctx, params.id, 'aprobada');
		return { success: true };
	},
	cancel: async ({ locals, params }) => {
		const { companyId } = requireCompany(locals);
		const ctx = toTenantContext(companyId);
		const quote = await getQuoteRepository().findById(ctx, params.id);
		if (!quote) error(404, 'Cotización no encontrada');
		if (quote.status === 'convertida') return fail(400, { error: 'No se puede cancelar una cotización convertida.' });
		await getQuoteRepository().changeStatus(ctx, params.id, 'cancelada');
		throw redirect(303, '/quotes');
	},
	convert: async ({ locals, params }) => {
		const { companyId } = requireCompany(locals);
		const ctx = toTenantContext(companyId);
		try {
			const { order } = await getQuoteConversionService().convertToWorkOrder(ctx, params.id);
			throw redirect(303, `/work-orders/${order.id}`);
		} catch (conversionError) {
			const message = conversionError instanceof Error ? conversionError.message : 'No se pudo convertir la cotización.';
			return fail(400, { error: message });
		}
	}
};
