import type {
	PaymentListFilters,
	RepositoryContext,
	TenantCreatePaymentInput,
	TenantPaymentRepository
} from '@esr/core';
import { requireCompanyId } from '@esr/core';
import type { ESRId, Payment } from '@esr/schemas';
import type pg from 'pg';
import { getPostgresPool } from '../connection';
import { appendPagination } from './pagination';

/**
 * Pagos de la factura.
 *
 * La factura es el documento de dinero, asi que un pago cuelga de UNA factura y
 * de ninguna otra cosa. El ancla ha cambiado dos veces —contrato, luego
 * conduce— y siempre por el mismo motivo: mientras el pago pudo colgar de dos
 * sitios, el saldo se calculaba en uno y se cobraba en otro.
 *
 * `amount` se devuelve como texto: en `NUMERIC` el driver daria un float y los
 * centavos dejarian de cuadrar.
 */
const PAYMENT_COLUMNS = `
	p.id, p.company_id, p.client_id, p.invoice_id,
	p.date, p.amount::text AS amount, p.method, p.reference, p.status, p.notes,
	p.created_at, p.updated_at
`;

const RETURNING_COLUMNS = `
	id, company_id, client_id, invoice_id,
	date, amount::text AS amount, method, reference, status, notes, created_at, updated_at
`;

export class PostgresPaymentRepository implements TenantPaymentRepository {
	constructor(private readonly pool: pg.Pool = getPostgresPool()) {}

	async findById(ctx: RepositoryContext, id: ESRId): Promise<Payment | null> {
		const result = await this.pool.query<Payment>(
			`SELECT ${PAYMENT_COLUMNS} FROM payments p WHERE p.company_id = $1 AND p.id = $2`,
			[requireCompanyId(ctx), id]
		);
		return result.rows[0] ?? null;
	}

	async list(ctx: RepositoryContext, filters: PaymentListFilters = {}): Promise<Payment[]> {
		const params: unknown[] = [requireCompanyId(ctx)];
		const where = ['p.company_id = $1'];

		for (const field of ['invoice_id', 'client_id', 'status'] as const) {
			const value = filters[field];
			if (value !== undefined && value !== null && value !== '') {
				params.push(value);
				where.push(`p.${field} = $${params.length}`);
			}
		}

		const result = await this.pool.query<Payment>(
			`SELECT ${PAYMENT_COLUMNS}
			 FROM payments p
			 WHERE ${where.join(' AND ')}
			 ORDER BY p.created_at DESC${appendPagination(params, filters)}`,
			params
		);
		return result.rows;
	}

	/** Los pagos de una factura, los anulados incluidos: el resumen ya los ignora. */
	async listForInvoice(ctx: RepositoryContext, invoiceId: ESRId): Promise<Payment[]> {
		const result = await this.pool.query<Payment>(
			`SELECT ${PAYMENT_COLUMNS}
			 FROM payments p
			 WHERE p.company_id = $1 AND p.invoice_id = $2
			 ORDER BY p.created_at DESC`,
			[requireCompanyId(ctx), invoiceId]
		);
		return result.rows;
	}

	async create(ctx: RepositoryContext, data: TenantCreatePaymentInput): Promise<Payment> {
		const result = await this.pool.query<Payment>(
			`INSERT INTO payments
				(company_id, client_id, invoice_id, date, amount, method, reference, status, notes)
			 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
			 RETURNING ${RETURNING_COLUMNS}`,
			[
				requireCompanyId(ctx),
				data.client_id ?? null,
				data.invoice_id,
				data.date ?? null,
				data.amount,
				data.method ?? null,
				data.reference ?? null,
				data.status ?? 'pagado',
				data.notes ?? null
			]
		);
		return result.rows[0];
	}

	/** Nunca se borra: la fila permanece para dejar rastro de que existio. */
	async voidPayment(ctx: RepositoryContext, id: ESRId): Promise<Payment> {
		const result = await this.pool.query<Payment>(
			`UPDATE payments SET status = 'anulado', updated_at = NOW()
			 WHERE company_id = $1 AND id = $2
			 RETURNING ${RETURNING_COLUMNS}`,
			[requireCompanyId(ctx), id]
		);
		if (!result.rows[0]) throw new Error(`Pago ${id} no existe en esta empresa.`);
		return result.rows[0];
	}

	/** Anula de golpe los pagos de una factura. Lo usa la anulacion de la factura. */
	async voidByInvoice(ctx: RepositoryContext, invoiceId: ESRId, client?: pg.PoolClient): Promise<number> {
		const db = client ?? this.pool;
		const result = await db.query(
			`UPDATE payments SET status = 'anulado', updated_at = NOW()
			 WHERE company_id = $1 AND invoice_id = $2 AND status <> 'anulado'`,
			[requireCompanyId(ctx), invoiceId]
		);
		return result.rowCount ?? 0;
	}
}
