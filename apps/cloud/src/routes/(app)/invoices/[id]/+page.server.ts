import { error, fail } from '@sveltejs/kit';
import {
	canVoidPayment,
	RECORD_STATE,
	summarizePayments,
	todayISO,
	validatePaymentAmount
} from '@esr/core';
import type { Actions, PageServerLoad } from './$types';
import { recordAuditLog } from '$lib/server/audit';
import {
	getInvoiceRepository,
	getInvoiceService,
	getPaymentRepository
} from '$lib/server/repositories';
import { requirePermission } from '$lib/server/permissions';
import { toTenantContext } from '$lib/server/tenant';

/** Una factura anulada no admite cobros nuevos. */
const CANCELLED = 'anulada';

export const load: PageServerLoad = async ({ locals, params }) => {
	const { companyId } = requirePermission(locals, 'invoices.view');
	const ctx = toTenantContext(companyId);

	const invoice = await getInvoiceRepository().findById(ctx, params.id);
	if (!invoice) error(404, 'Factura no encontrada');

	const [items, conduces, payments] = await Promise.all([
		getInvoiceRepository().listItems(ctx, params.id),
		getInvoiceRepository().listConduces(ctx, params.id),
		getPaymentRepository().listForInvoice(ctx, params.id)
	]);

	return {
		invoice,
		items,
		conduces,
		payments,
		summary: summarizePayments(invoice.total, payments),
		cobrable: invoice.status !== CANCELLED
	};
};

export const actions: Actions = {
	registerPayment: async (event) => {
		const { companyId } = requirePermission(event.locals, 'payments.register');
		const ctx = toTenantContext(companyId);
		const form = await event.request.formData();

		const invoice = await getInvoiceRepository().findById(ctx, event.params.id);
		if (!invoice) error(404, 'Factura no encontrada');
		if (invoice.status === CANCELLED) {
			return fail(400, { error: 'Una factura anulada no admite cobros.' });
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
	 * Estado de CIRCULACION, que es otro eje que el de negocio: una factura
	 * anulada sigue estando activa —se consulta— hasta que se archiva. Nunca
	 * borra: la fila permanece.
	 */
	setState: async (event) => {
		const { companyId } = requirePermission(event.locals, 'invoices.archive');
		const ctx = toTenantContext(companyId);
		const form = await event.request.formData();
		const state = Number(form.get('state'));

		const permitidos: number[] = [RECORD_STATE.ACTIVE, RECORD_STATE.INACTIVE, RECORD_STATE.ARCHIVED];
		if (!permitidos.includes(state)) {
			return fail(400, { error: 'Estado no válido.' });
		}

		const invoice = await getInvoiceRepository().findById(ctx, event.params.id);
		if (!invoice) error(404, 'Factura no encontrada');

		await getInvoiceRepository().setState(ctx, event.params.id, state);

		await recordAuditLog(event, {
			action: state === RECORD_STATE.ARCHIVED ? 'invoice.archived' : 'invoice.restored',
			entity_type: 'invoice',
			entity_id: String(event.params.id),
			description: `Factura ${invoice.invoice_number} pasó a estado ${state}`,
			metadata: { state }
		});

		return { success: state === RECORD_STATE.ARCHIVED ? 'Factura archivada.' : 'Factura restaurada.' };
	}
};
