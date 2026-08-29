import type { ESRId, Payment } from '@esr/schemas';
import type { RepositoryContext } from '../shared/tenant';

export type TenantCreatePaymentInput = Omit<Payment, 'id' | 'company_id'>;

export type PaymentListFilters = {
	contract_id?: ESRId;
	quotation_id?: ESRId;
	client_id?: ESRId;
	status?: string;
	limit?: number;
	offset?: number;
};

/**
 * Un pago cuelga del CONTRATO cuando existe y, si no, de la COTIZACION
 * aprobada. Asi se puede cobrar un anticipo antes de firmar sin perder la
 * trazabilidad, y el saldo se calcula siempre sobre el total de la cotizacion.
 */
export interface TenantPaymentRepository {
	findById(ctx: RepositoryContext, id: ESRId): Promise<Payment | null>;
	list(ctx: RepositoryContext, filters?: PaymentListFilters): Promise<Payment[]>;
	/** Pagos de una cotizacion, incluidos los hechos a traves de su contrato. */
	listForQuotation(ctx: RepositoryContext, quotationId: ESRId): Promise<Payment[]>;
	create(ctx: RepositoryContext, data: TenantCreatePaymentInput): Promise<Payment>;
	/** Nunca se borra: pasa a `anulado` y deja de contar en el saldo. */
	voidPayment(ctx: RepositoryContext, id: ESRId): Promise<Payment>;
}
