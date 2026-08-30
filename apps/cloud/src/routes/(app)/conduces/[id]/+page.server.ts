import { error, fail } from '@sveltejs/kit';
import { canVoidPayment, summarizePayments, todayISO, validatePaymentAmount } from '@esr/core';
import type { Actions, PageServerLoad } from './$types';
import { recordAuditLog } from '$lib/server/audit';
import {
	getConduceRepository,
	getPaymentRepository,
	getRentalRepository
} from '$lib/server/repositories';
import { requirePermission } from '$lib/server/permissions';
import { toTenantContext } from '$lib/server/tenant';

/** Un conduce anulado no admite cobros nuevos. */
const CANCELLED = 'anulado';

export const load: PageServerLoad = async ({ locals, params }) => {
	const { companyId } = requirePermission(locals, 'conduces.view');
	const ctx = toTenantContext(companyId);

	const conduce = await getConduceRepository().findById(ctx, params.id);
	if (!conduce) error(404, 'Conduce no encontrado');

	const [items, order, payments] = await Promise.all([
		getConduceRepository().listItems(ctx, params.id),
		getRentalRepository().findById(ctx, conduce.work_order_id),
		getPaymentRepository().listForConduce(ctx, params.id)
	]);

	return {
		conduce,
		items,
		order,
		payments,
		// El conduce es el documento que se cobra: su total es el acordado.
		summary: summarizePayments(conduce.total, payments),
		cobrable: conduce.status !== CANCELLED
	};
};

export const actions: Actions = {
	registerPayment: async (event) => {
		const { companyId } = requirePermission(event.locals, 'payments.register');
		const ctx = toTenantContext(companyId);
		const form = await event.request.formData();

		const conduce = await getConduceRepository().findById(ctx, event.params.id);
		if (!conduce) error(404, 'Conduce no encontrado');
		if (conduce.status === CANCELLED) {
			return fail(400, { error: 'Un conduce anulado no admite cobros.' });
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
			conduce_id: event.params.id,
			client_id: conduce.client_id ?? undefined,
			date: values.date || todayISO(),
			amount: Number(values.amount),
			method: values.method || null,
			reference: values.reference || null,
			status: 'pagado',
			notes: values.notes || null
		});

		await recordAuditLog(event, {
			action: 'payment.registered',
			entity_type: 'conduce',
			entity_id: String(event.params.id),
			description: `Cobro de ${values.amount} registrado en ${conduce.note_number || event.params.id}`,
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
		// El cobro tiene que ser de ESTE conduce: sin esto, un POST manipulado
		// anularia el de cualquier otro.
		if (String(payment.conduce_id) !== String(event.params.id)) {
			return fail(404, { error: 'Cobro no encontrado.' });
		}
		if (!canVoidPayment(payment)) {
			return fail(400, { error: 'Ese cobro ya estaba anulado.' });
		}

		const voided = await getPaymentRepository().voidPayment(ctx, paymentId);

		await recordAuditLog(event, {
			action: 'payment.voided',
			entity_type: 'conduce',
			entity_id: String(event.params.id),
			description: `Cobro de ${voided.amount} anulado`,
			metadata: { paymentId }
		});

		return { success: 'Cobro anulado.' };
	}
};
