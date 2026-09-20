import { error, fail } from '@sveltejs/kit';
import { canVoidPayment, summarizePayments, todayISO, validatePaymentAmount } from '@esr/core';
import type { Actions, PageServerLoad } from './$types';
import { recordAuditLog } from '$lib/server/audit';
import {
	getCustomerRepository,
	getInvoiceRepository,
	getInvoiceService,
	getPaymentRepository
} from '$lib/server/repositories';
import { requirePermission } from '$lib/server/permissions';
import { toTenantContext } from '$lib/server/tenant';

export const load: PageServerLoad = async ({ locals, params }) => {
	const { companyId } = requirePermission(locals, 'invoices.view');
	const ctx = toTenantContext(companyId);

	const invoice = await getInvoiceRepository().findById(ctx, params.id);
	if (!invoice) error(404, 'Factura no encontrada');

	const [items, conduces, payments, customer] = await Promise.all([
		getInvoiceRepository().listItems(ctx, params.id),
		getInvoiceRepository().listConduces(ctx, params.id),
		getPaymentRepository().listForInvoice(ctx, params.id),
		invoice.client_id ? getCustomerRepository().findById(ctx, invoice.client_id) : Promise.resolve(null)
	]);

	return {
		invoice,
		items,
		conduces,
		payments,
		customer,
		summary: summarizePayments(invoice.total, payments),
		// Un borrador todavia no es un compromiso firme: antes el corte era solo
		// «no anulada», ahora tiene que estar ademas emitida. Ni un borrador ni
		// una anulada admiten cobro.
		cobrable: invoice.status === 'emitida'
	};
};

export const actions: Actions = {
	registerPayment: async (event) => {
		const { companyId } = requirePermission(event.locals, 'payments.register');
		const ctx = toTenantContext(companyId);
		const form = await event.request.formData();

		const invoice = await getInvoiceRepository().findById(ctx, event.params.id);
		if (!invoice) error(404, 'Factura no encontrada');
		if (invoice.status !== 'emitida') {
			return fail(400, { error: 'Solo se puede registrar un cobro en una factura emitida.' });
		}

		const values = {
			amount: String(form.get('amount') ?? '').trim(),
			method: String(form.get('method') ?? '').trim(),
			reference: String(form.get('reference') ?? '').trim(),
			date: String(form.get('date') ?? '').trim(),
			notes: String(form.get('notes') ?? '').trim()
		};

		if (!validatePaymentAmount(values.amount)) {
			return fail(400, {
				error: 'El importe debe ser mayor que cero.',
				fieldErrors: { amount: 'El importe debe ser mayor que cero.' },
				values
			});
		}

		const payment = await getPaymentRepository().create(ctx, {
			invoice_id: event.params.id,
			client_id: invoice.client_id ?? undefined,
			date: values.date || todayISO(),
			amount: Number(values.amount),
			method: values.method || null,
			reference: values.reference || null,
			status: 'pagado',
			notes: values.notes || null
		});

		await recordAuditLog(event, {
			action: 'payment.registered',
			entity_type: 'invoice',
			entity_id: String(event.params.id),
			description: `Cobro de ${values.amount} registrado en ${invoice.invoice_number}`,
			metadata: { paymentId: payment.id, method: values.method || null }
		});

		return { success: 'Cobro registrado.' };
	},

	voidPayment: async (event) => {
		const { companyId } = requirePermission(event.locals, 'payments.void');
		const ctx = toTenantContext(companyId);
		const form = await event.request.formData();
		const paymentId = String(form.get('payment_id') ?? '').trim();
		if (!paymentId) return fail(400, { error: 'Falta el identificador del cobro.' });

		const payment = await getPaymentRepository().findById(ctx, paymentId);
		if (!payment) return fail(404, { error: 'Cobro no encontrado.' });
		// El cobro tiene que ser de ESTA factura: sin esto, un POST manipulado
		// anularia el de cualquier otra.
		if (String(payment.invoice_id) !== String(event.params.id)) {
			return fail(404, { error: 'Cobro no encontrado.' });
		}
		if (!canVoidPayment(payment)) {
			return fail(400, { error: 'Ese cobro ya estaba anulado.' });
		}

		const voided = await getPaymentRepository().voidPayment(ctx, paymentId);

		await recordAuditLog(event, {
			action: 'payment.voided',
			entity_type: 'invoice',
			entity_id: String(event.params.id),
			description: `Cobro de ${voided.amount} anulado`,
			metadata: { paymentId }
		});

		return { success: 'Cobro anulado.' };
	},

	/**
	 * Anular la factura anula tambien sus cobros y libera sus entregas, que
	 * vuelven a poder facturarse. Va todo en una transaccion en el servicio.
	 */
	cancelInvoice: async (event) => {
		const { companyId } = requirePermission(event.locals, 'invoices.cancel');
		const ctx = toTenantContext(companyId);
		const form = await event.request.formData();
		const reason = String(form.get('reason') ?? '').trim();
		if (!reason) return fail(400, { error: 'Indique el motivo de la anulación.' });

		let resultado;
		try {
			resultado = await getInvoiceService().cancel(ctx, event.params.id, reason);
		} catch (err) {
			return fail(400, { error: (err as Error).message });
		}

		await recordAuditLog(event, {
			action: 'invoice.cancelled',
			entity_type: 'invoice',
			entity_id: String(event.params.id),
			description: `Factura ${resultado.invoice.invoice_number} anulada: ${reason}`,
			metadata: { voidedPayments: resultado.voidedPayments }
		});

		// El numero de cobros anulados se dice en voz alta: anular una factura
		// cobrada deshace dinero ya registrado y eso no puede pasar callado.
		return {
			success: resultado.voidedPayments
				? `Factura anulada. Se anularon también ${resultado.voidedPayments} cobro(s).`
				: 'Factura anulada.'
		};
	},

	/**
	 * Un borrador pasa a ser una factura firme: numeracion definitiva y ya no
	 * editable. El servicio es quien valida que tenga lineas y lo que haga
	 * falta; aqui solo se traduce su rechazo a un mensaje de formulario.
	 */
	finalize: async (event) => {
		const { companyId } = requirePermission(event.locals, 'invoices.finalize');
		const ctx = toTenantContext(companyId);
		let resultado;
		try {
			resultado = await getInvoiceService().finalize(ctx, event.params.id);
		} catch (err) {
			return fail(400, { error: (err as Error).message });
		}

		await recordAuditLog(event, {
			action: 'invoice.finalized',
			entity_type: 'invoice',
			entity_id: String(event.params.id),
			description: `Factura ${resultado.invoice_number} finalizada`
		});

		// Mensaje explicito y no `true`: el mismo `$effect` que muestra el error
		// de esta pantalla tambien enseña `form.success` en un toast, y el resto
		// de las acciones de este archivo ya devuelven una frase, no un booleano.
		return { success: 'Factura finalizada.' };
	}
};
