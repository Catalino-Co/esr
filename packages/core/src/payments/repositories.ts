import type { ESRId, Payment } from '@esr/schemas';
import type { RepositoryContext } from '../shared/tenant';

export type TenantCreatePaymentInput = Omit<Payment, 'id' | 'company_id'>;

export type PaymentListFilters = {
	invoice_id?: ESRId;
	client_id?: ESRId;
	status?: string;
	limit?: number;
	offset?: number;
};

/**
 * Un pago cuelga de UNA factura y de ninguna otra cosa.
 *
 * El saldo se calcula sobre el total de la factura. El ancla ha cambiado dos
 * veces —contrato, luego conduce— y siempre por lo mismo: cada vez que el pago
 * podia colgar de dos sitios, el saldo se miraba en uno y se cobraba en otro.
 * La factura es el ancla definitiva porque es el unico documento que existe
 * para cobrar.
 */
export interface TenantPaymentRepository {
	findById(ctx: RepositoryContext, id: ESRId): Promise<Payment | null>;
	list(ctx: RepositoryContext, filters?: PaymentListFilters): Promise<Payment[]>;
	/** Los pagos de una factura, anulados incluidos: el resumen ya los ignora. */
	listForInvoice(ctx: RepositoryContext, invoiceId: ESRId): Promise<Payment[]>;
	create(ctx: RepositoryContext, data: TenantCreatePaymentInput): Promise<Payment>;
	/** Nunca se borra: pasa a `anulado` y deja de contar en el saldo. */
	voidPayment(ctx: RepositoryContext, id: ESRId): Promise<Payment>;
}
