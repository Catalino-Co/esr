import { fail, redirect } from '@sveltejs/kit';
import { todayISO } from '@esr/core';
import type { Actions, PageServerLoad } from './$types';
import { recordAuditLog } from '$lib/server/audit';
import { requirePermission } from '$lib/server/permissions';
import {
	getInvoiceRepository,
	getInvoiceService,
	getRentalRepository
} from '$lib/server/repositories';
import { toTenantContext } from '$lib/server/tenant';

/**
 * Emitir una factura es elegir QUE ENTREGAS cubre.
 *
 * Por eso la pantalla arranca por la orden: solo se factura lo ya entregado, y
 * las entregas de una orden son la unidad que se puede juntar en un documento.
 * Una devolución nunca aparece aquí — no se factura lo que vuelve.
 */
export const load: PageServerLoad = async ({ locals, url }) => {
	const { companyId } = requirePermission(locals, 'invoices.create');
	const ctx = toTenantContext(companyId);

	const orderId = url.searchParams.get('order')?.trim() || '';
	if (!orderId) {
		return {
			orders: await getInvoiceRepository().listOrdersWithBillable(ctx),
			order: null,
			conduces: [],
			hoy: todayISO()
		};
	}

	const order = await getRentalRepository().findById(ctx, orderId);
	if (!order) {
		return {
			orders: await getInvoiceRepository().listOrdersWithBillable(ctx),
			order: null,
			conduces: [],
			hoy: todayISO(),
			aviso: 'Esa orden no existe en esta empresa.'
		};
	}

	return {
		orders: [],
		order,
		conduces: await getInvoiceRepository().listBillableConduces(ctx, orderId),
		hoy: todayISO()
	};
};

export const actions: Actions = {
	create: async (event) => {
		const { companyId } = requirePermission(event.locals, 'invoices.create');
		const ctx = toTenantContext(companyId);
		const form = await event.request.formData();

		const workOrderId = String(form.get('work_order_id') ?? '').trim();
		const conduceIds = form.getAll('conduce_ids').map((value) => String(value).trim()).filter(Boolean);
		const values = {
			date: String(form.get('date') ?? '').trim(),
			discount: String(form.get('discount') ?? '').trim(),
			notes: String(form.get('notes') ?? '').trim()
		};

		if (!workOrderId) return fail(400, { error: 'Falta la orden.', values });
		if (!conduceIds.length) {
			return fail(400, { error: 'Elija al menos una entrega para facturar.', values });
		}

		const discount = values.discount ? Number(values.discount) : 0;
		if (!Number.isFinite(discount) || discount < 0) {
			return fail(400, { error: 'El descuento no puede ser negativo.', values });
		}

		let invoice;
		try {
			invoice = await getInvoiceService().create(ctx, {
				work_order_id: workOrderId,
				conduce_ids: conduceIds,
				date: values.date || null,
				discount,
				notes: values.notes || null
			});
		} catch (error) {
			// El servicio relee las entregas dentro de la transacción, así que aquí
			// llegan los choques reales: otra factura se llevó una entrega entre que
			// se pintó la pantalla y se envió.
			return fail(400, { error: (error as Error).message, values });
		}

		await recordAuditLog(event, {
			action: 'invoice.created',
			entity_type: 'invoice',
			entity_id: String(invoice.id),
			description: `Factura ${invoice.invoice_number} emitida por ${invoice.total}`,
			metadata: { workOrderId, conduceIds, discount }
		});

		redirect(303, `/invoices/${invoice.id}`);
	}
};
