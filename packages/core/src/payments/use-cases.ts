import type { Payment, PaymentStatus } from '@esr/schemas';

/**
 * Reglas de dinero de ESR. Puras: no saben de PostgreSQL ni de SvelteKit.
 *
 * El monto a cobrar vive en la COTIZACION (`quotations.total`); ni las ordenes
 * de trabajo ni los contratos guardan su propio total. El contrato formaliza
 * ese acuerdo y los pagos lo van reduciendo.
 */

/** Solo un pago en estado `pagado` reduce el saldo. */
export const PAID_STATUS: PaymentStatus = 'pagado';
export const PENDING_STATUS: PaymentStatus = 'pendiente';
export const VOID_STATUS: PaymentStatus = 'anulado';

export type PaymentSummary = {
	/** Total acordado, tomado de la cotizacion. */
	total: number;
	/** Suma de los pagos confirmados. */
	paid: number;
	/** Suma de los pagos registrados pero aun no confirmados. */
	pending: number;
	/** Lo que falta por cobrar. Nunca baja de cero. */
	balance: number;
	/** Un sobrepago no reduce el saldo por debajo de cero: se reporta aparte. */
	overpaid: number;
	settled: boolean;
};

function round(value: number): number {
	// Dos decimales: los importes son NUMERIC(12,2) en PostgreSQL y sumar
	// flotantes arrastra restos como 0.30000000000000004.
	return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function sumBy(payments: readonly Payment[], status: PaymentStatus): number {
	return round(
		payments
			.filter((payment) => payment.status === status)
			.reduce((acc, payment) => acc + Number(payment.amount ?? 0), 0)
	);
}

/**
 * Estado de cuenta de un acuerdo.
 *
 * Los pagos anulados se ignoran por completo: siguen en la tabla para dejar
 * rastro de que existieron, pero no cuentan.
 */
export function summarizePayments(
	total: number | string | null | undefined,
	payments: readonly Payment[] = []
): PaymentSummary {
	const agreed = round(Number(total ?? 0));
	const paid = sumBy(payments, PAID_STATUS);
	const pending = sumBy(payments, PENDING_STATUS);
	const difference = round(agreed - paid);

	return {
		total: agreed,
		paid,
		pending,
		balance: difference > 0 ? difference : 0,
		overpaid: difference < 0 ? round(-difference) : 0,
		settled: difference <= 0 && agreed > 0
	};
}

/** Un pago debe tener importe positivo. */
export function validatePaymentAmount(amount: number | string | null | undefined): boolean {
	const value = Number(amount);
	return Number.isFinite(value) && value > 0;
}

/**
 * Un pago ya anulado no se vuelve a anular, y uno anulado tampoco se reactiva:
 * si el cobro se rehace, se registra uno nuevo.
 */
export function canVoidPayment(payment: Pick<Payment, 'status'>): boolean {
	return payment.status !== VOID_STATUS;
}
