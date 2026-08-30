import type { ESRId, Payment } from '@esr/schemas';
import type { RepositoryContext } from '../shared/tenant';

export type TenantCreatePaymentInput = Omit<Payment, 'id' | 'company_id'>;

export type PaymentListFilters = {
	conduce_id?: ESRId;
	client_id?: ESRId;
	status?: string;
	limit?: number;
	offset?: number;
};

/**
 * Un pago cuelga de UN conduce y de ninguna otra cosa.
 *
 * El conduce es el documento de dinero —lo que sera la factura—, asi que el
 * saldo se calcula sobre su total. Antes el pago tenia doble ancla, contrato o
 * cotizacion, que es lo que hacia que el saldo se mirase en un sitio y se
 * cobrase en otro.
 */
export interface TenantPaymentRepository {
	findById(ctx: RepositoryContext, id: ESRId): Promise<Payment | null>;
	list(ctx: RepositoryContext, filters?: PaymentListFilters): Promise<Payment[]>;
	/** Los pagos de un conduce, anulados incluidos: el resumen ya los ignora. */
	listForConduce(ctx: RepositoryContext, conduceId: ESRId): Promise<Payment[]>;
	create(ctx: RepositoryContext, data: TenantCreatePaymentInput): Promise<Payment>;
	/** Nunca se borra: pasa a `anulado` y deja de contar en el saldo. */
	voidPayment(ctx: RepositoryContext, id: ESRId): Promise<Payment>;
}
