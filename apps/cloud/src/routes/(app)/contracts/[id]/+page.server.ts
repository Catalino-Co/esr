import { error, fail } from '@sveltejs/kit';
import { canVoidPayment, summarizePayments, validatePaymentAmount } from '@esr/core';
import type { Actions, PageServerLoad } from './$types';
import { recordAuditLog } from '$lib/server/audit';
import { requirePermission } from '$lib/server/permissions';
import { getContractRepository, getPaymentRepository } from '$lib/server/repositories';
import { toTenantContext } from '$lib/server/tenant';

/** Estados desde los que aún se puede firmar o cancelar. */
const OPEN_STATUS = ['borrador', 'firmado'];

async function loadContract(companyId: string, id: string) {
	const ctx = toTenantContext(companyId);
	const contract = await getContractRepository().findById(ctx, id);
	if (!contract) throw error(404, 'Contrato no encontrado.');

	// El estado de cuenta cubre la cotización entera: un anticipo cobrado antes
	// de firmar y un abono posterior contra el contrato suman en el mismo saldo.
	const payments = contract.quotation_id
		? await getPaymentRepository().listForQuotation(ctx, contract.quotation_id)
		: await getPaymentRepository().list(ctx, { contract_id: id });

	return { ctx, contract, payments, summary: summarizePayments(contract.quote_total, payments) };
}

export const load: PageServerLoad = async ({ locals, params }) => {
	const { companyId } = requirePermission(locals, 'contracts.view');
	const { contract, payments, summary } = await loadContract(companyId, params.id);
	return { contract, payments, summary };
};

export const actions: Actions = {
	update: async (event) => {
		const { companyId } = requirePermission(event.locals, 'contracts.update');
		const ctx = toTenantContext(companyId);
		const form = await event.request.formData();

		const contract = await getContractRepository().findById(ctx, event.params.id);
		if (!contract) return fail(404, { error: 'Contrato no encontrado.' });
		if (contract.status === 'cancelado') {
			return fail(400, { error: 'Un contrato cancelado no se puede editar.' });
		}

		const updated = await getContractRepository().update(ctx, event.params.id, {
			date: String(form.get('date') ?? '').trim() || null,
			terms: String(form.get('terms') ?? '').trim() || null,
			notes: String(form.get('notes') ?? '').trim() || null
		});

		await recordAuditLog(event, {
			action: 'contract.updated',
			entity_type: 'contract',
			entity_id: String(updated.id),
			description: `Contrato actualizado: ${updated.number}`
		});

		return { success: 'Contrato actualizado.' };
	},

	sign: async (event) => {
		const { companyId } = requirePermission(event.locals, 'contracts.sign');
		const ctx = toTenantContext(companyId);

		const contract = await getContractRepository().findById(ctx, event.params.id);
		if (!contract) return fail(404, { error: 'Contrato no encontrado.' });
		if (contract.status !== 'borrador') {
			return fail(400, { error: 'Solo un contrato en borrador se puede firmar.' });
		}

		const signed = await getContractRepository().changeStatus(ctx, event.params.id, 'firmado');

		await recordAuditLog(event, {
			action: 'contract.signed',
			entity_type: 'contract',
			entity_id: String(signed.id),
			description: `Contrato firmado: ${signed.number}`
		});

		return { success: `Contrato ${signed.number} marcado como firmado.` };
	},

	cancel: async (event) => {
		const { companyId } = requirePermission(event.locals, 'contracts.cancel');
		const ctx = toTenantContext(companyId);

		const { contract, summary } = await loadContract(companyId, event.params.id);
		if (!OPEN_STATUS.includes(String(contract.status))) {
			return fail(400, { error: 'Ese contrato ya está cancelado.' });
		}

		// Cancelar con dinero cobrado deja pagos apuntando a un acuerdo muerto.
		// No se bloquea —puede ser exactamente lo que se quiere—, pero se avisa.
		const cancelled = await getContractRepository().changeStatus(
			ctx,
			event.params.id,
			'cancelado'
		);

		await recordAuditLog(event, {
			action: 'contract.cancelled',
			entity_type: 'contract',
			entity_id: String(cancelled.id),
			description: `Contrato cancelado: ${cancelled.number}`,
			metadata: { cobrado: summary.paid }
		});

		const base = `Contrato ${cancelled.number} cancelado.`;
		return {
			success:
				summary.paid > 0
					? `${base} Hay ${summary.paid.toFixed(2)} ya cobrado; revise si procede una devolución.`
					: base
		};
	},

	registerPayment: async (event) => {
		const { companyId } = requirePermission(event.locals, 'payments.register');
		const ctx = toTenantContext(companyId);
		const form = await event.request.formData();

		const contract = await getContractRepository().findById(ctx, event.params.id);
		if (!contract) return fail(404, { error: 'Contrato no encontrado.' });
		if (contract.status === 'cancelado') {
			return fail(400, { error: 'No se pueden registrar pagos en un contrato cancelado.' });
		}

		const amount = Number(String(form.get('amount') ?? '').replace(',', '.'));
		if (!validatePaymentAmount(amount)) {
			return fail(400, { error: 'El importe debe ser un número mayor que cero.' });
		}

		const status = String(form.get('status') ?? 'pagado');
		if (status !== 'pagado' && status !== 'pendiente') {
			return fail(400, { error: 'Estado de pago no válido.' });
		}

		const payment = await getPaymentRepository().create(ctx, {
			client_id: contract.client_id,
			quotation_id: contract.quotation_id,
			contract_id: event.params.id,
			date: String(form.get('date') ?? '').trim() || new Date().toISOString().slice(0, 10),
			amount,
			method: String(form.get('method') ?? '').trim() || null,
			reference: String(form.get('reference') ?? '').trim() || null,
			status,
			notes: String(form.get('notes') ?? '').trim() || null
		});

		await recordAuditLog(event, {
			action: 'payment.registered',
			entity_type: 'payment',
			entity_id: String(payment.id),
			description: `Pago de ${amount.toFixed(2)} registrado en ${contract.number}`,
			metadata: { método: payment.method, estado: status }
		});

		return { success: `Pago de ${amount.toFixed(2)} registrado.` };
	},

	voidPayment: async (event) => {
		const { companyId } = requirePermission(event.locals, 'payments.void');
		const ctx = toTenantContext(companyId);
		const form = await event.request.formData();

		const paymentId = String(form.get('payment_id') ?? '').trim();
		if (!paymentId) return fail(400, { error: 'Falta el identificador del pago.' });

		const payment = await getPaymentRepository().findById(ctx, paymentId);
		if (!payment) return fail(404, { error: 'Pago no encontrado.' });
		if (!canVoidPayment(payment)) {
			return fail(400, { error: 'Ese pago ya está anulado.' });
		}

		const voided = await getPaymentRepository().voidPayment(ctx, paymentId);

		await recordAuditLog(event, {
			action: 'payment.voided',
			entity_type: 'payment',
			entity_id: String(voided.id),
			description: `Pago de ${Number(voided.amount).toFixed(2)} anulado`
		});

		return { success: 'Pago anulado. Deja de contar en el saldo, pero queda registrado.' };
	}
};
