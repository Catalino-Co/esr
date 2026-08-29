import type {
	ContractListFilters,
	PaymentListFilters,
	RepositoryContext,
	TenantContractRepository,
	TenantCreatePaymentInput,
	TenantPaymentRepository
} from '@esr/core';
import { requireCompanyId } from '@esr/core';
import type { Contract, ESRId, Payment } from '@esr/schemas';
import type pg from 'pg';
import { getPostgresPool } from '../connection';
import { appendPagination } from './pagination';

const CONTRACT_COLUMNS = `
	c.id, c.company_id, c.client_id, c.event_id, c.quotation_id,
	c.number, c.date, c.status, c.terms, c.notes,
	c.created_at, c.updated_at, c.is_active
`;

/** Datos de la cotizacion y del cliente que la pantalla necesita junto al contrato. */
export type ContractView = Contract & {
	client_name?: string | null;
	event_name?: string | null;
	quote_number?: string | null;
	quote_total?: string | null;
	quote_status?: string | null;
};

export class PostgresContractRepository implements TenantContractRepository {
	constructor(private readonly pool: pg.Pool = getPostgresPool()) {}

	/**
	 * Numeracion por empresa: ultimo numero + 1, igual que COT-/ORD-.
	 * No es apta para alta concurrencia; el indice unico de la migracion 008 es
	 * lo que impide de verdad que se repita.
	 */
	async nextNumber(ctx: RepositoryContext): Promise<string> {
		const result = await this.pool.query<{ max: string | null }>(
			`SELECT MAX(NULLIF(REGEXP_REPLACE(number, '\\D', '', 'g'), ''))::bigint::text AS max
			 FROM contracts
			 WHERE company_id = $1 AND number LIKE 'CTR-%'`,
			[requireCompanyId(ctx)]
		);
		const next = Number(result.rows[0]?.max ?? 0) + 1;
		return `CTR-${String(next).padStart(6, '0')}`;
	}

	async findById(ctx: RepositoryContext, id: ESRId): Promise<ContractView | null> {
		const result = await this.pool.query<ContractView>(
			`SELECT ${CONTRACT_COLUMNS},
				cl.name AS client_name,
				e.name AS event_name,
				q.quote_number AS quote_number,
				q.total::text AS quote_total,
				q.status AS quote_status
			 FROM contracts c
			 LEFT JOIN clients cl ON cl.id = c.client_id AND cl.company_id = c.company_id
			 LEFT JOIN events e ON e.id = c.event_id AND e.company_id = c.company_id
			 LEFT JOIN quotations q ON q.id = c.quotation_id AND q.company_id = c.company_id
			 WHERE c.company_id = $1 AND c.id = $2`,
			[requireCompanyId(ctx), id]
		);
		return result.rows[0] ?? null;
	}

	async list(ctx: RepositoryContext, filters: ContractListFilters = {}): Promise<ContractView[]> {
		const params: unknown[] = [requireCompanyId(ctx)];
		const where = ['c.company_id = $1', 'c.is_active = 1'];

		if (filters.status) {
			params.push(filters.status);
			where.push(`c.status = $${params.length}`);
		}
		if (filters.quotation_id) {
			params.push(filters.quotation_id);
			where.push(`c.quotation_id = $${params.length}`);
		}
		if (filters.search) {
			params.push(`%${filters.search}%`);
			where.push(`(c.number ILIKE $${params.length} OR cl.name ILIKE $${params.length})`);
		}

		const result = await this.pool.query<ContractView>(
			`SELECT ${CONTRACT_COLUMNS},
				cl.name AS client_name,
				e.name AS event_name,
				q.quote_number AS quote_number,
				q.total::text AS quote_total
			 FROM contracts c
			 LEFT JOIN clients cl ON cl.id = c.client_id AND cl.company_id = c.company_id
			 LEFT JOIN events e ON e.id = c.event_id AND e.company_id = c.company_id
			 LEFT JOIN quotations q ON q.id = c.quotation_id AND q.company_id = c.company_id
			 WHERE ${where.join(' AND ')}
			 ORDER BY c.created_at DESC${appendPagination(params, filters)}`,
			params
		);
		return result.rows;
	}

	/** Solo devuelve el vigente: un contrato cancelado no bloquea rehacerlo. */
	async findByQuotationId(ctx: RepositoryContext, quotationId: ESRId): Promise<Contract | null> {
		const result = await this.pool.query<Contract>(
			`SELECT ${CONTRACT_COLUMNS}
			 FROM contracts c
			 WHERE c.company_id = $1 AND c.quotation_id = $2
			   AND c.is_active = 1 AND c.status <> 'cancelado'`,
			[requireCompanyId(ctx), quotationId]
		);
		return result.rows[0] ?? null;
	}

	async create(
		ctx: RepositoryContext,
		data: Omit<Contract, 'id' | 'company_id'>
	): Promise<Contract> {
		const result = await this.pool.query<Contract>(
			`INSERT INTO contracts
				(company_id, client_id, event_id, quotation_id, number, date, status, terms, notes)
			 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
			 RETURNING id, company_id, client_id, event_id, quotation_id,
				number, date, status, terms, notes, created_at, updated_at, is_active`,
			[
				requireCompanyId(ctx),
				data.client_id ?? null,
				data.event_id ?? null,
				data.quotation_id ?? null,
				data.number ?? null,
				data.date ?? null,
				data.status ?? 'borrador',
				data.terms ?? null,
				data.notes ?? null
			]
		);
		return result.rows[0];
	}

	async update(
		ctx: RepositoryContext,
		id: ESRId,
		data: Partial<Omit<Contract, 'id' | 'company_id'>>
	): Promise<Contract> {
		const result = await this.pool.query<Contract>(
			`UPDATE contracts SET
				date = COALESCE($3, date),
				terms = COALESCE($4, terms),
				notes = COALESCE($5, notes),
				updated_at = NOW()
			 WHERE company_id = $1 AND id = $2
			 RETURNING id, company_id, client_id, event_id, quotation_id,
				number, date, status, terms, notes, created_at, updated_at, is_active`,
			[requireCompanyId(ctx), id, data.date ?? null, data.terms ?? null, data.notes ?? null]
		);
		if (!result.rows[0]) throw new Error(`Contrato ${id} no existe en esta empresa.`);
		return result.rows[0];
	}

	async changeStatus(ctx: RepositoryContext, id: ESRId, status: string): Promise<Contract> {
		const result = await this.pool.query<Contract>(
			`UPDATE contracts SET status = $3, updated_at = NOW()
			 WHERE company_id = $1 AND id = $2
			 RETURNING id, company_id, client_id, event_id, quotation_id,
				number, date, status, terms, notes, created_at, updated_at, is_active`,
			[requireCompanyId(ctx), id, status]
		);
		if (!result.rows[0]) throw new Error(`Contrato ${id} no existe en esta empresa.`);
		return result.rows[0];
	}

	async deactivate(ctx: RepositoryContext, id: ESRId): Promise<void> {
		await this.pool.query(
			'UPDATE contracts SET is_active = 0, updated_at = NOW() WHERE company_id = $1 AND id = $2',
			[requireCompanyId(ctx), id]
		);
	}
}

const PAYMENT_COLUMNS = `
	p.id, p.company_id, p.client_id, p.quotation_id, p.contract_id,
	p.date, p.amount::text AS amount, p.method, p.reference, p.status, p.notes,
	p.created_at, p.updated_at
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

		for (const field of ['contract_id', 'quotation_id', 'client_id', 'status'] as const) {
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

	/**
	 * Todos los pagos que afectan al saldo de una cotizacion: los suyos directos
	 * y los hechos contra su contrato. El anticipo cobrado antes de firmar y el
	 * abono posterior tienen que sumar en el mismo estado de cuenta.
	 */
	async listForQuotation(ctx: RepositoryContext, quotationId: ESRId): Promise<Payment[]> {
		const result = await this.pool.query<Payment>(
			`SELECT ${PAYMENT_COLUMNS}
			 FROM payments p
			 WHERE p.company_id = $1
			   AND (
				p.quotation_id = $2
				OR p.contract_id IN (
					SELECT id FROM contracts WHERE company_id = $1 AND quotation_id = $2
				)
			   )
			 ORDER BY p.created_at DESC`,
			[requireCompanyId(ctx), quotationId]
		);
		return result.rows;
	}

	async create(ctx: RepositoryContext, data: TenantCreatePaymentInput): Promise<Payment> {
		const result = await this.pool.query<Payment>(
			`INSERT INTO payments
				(company_id, client_id, quotation_id, contract_id, date, amount, method, reference, status, notes)
			 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
			 RETURNING id, company_id, client_id, quotation_id, contract_id,
				date, amount::text AS amount, method, reference, status, notes, created_at, updated_at`,
			[
				requireCompanyId(ctx),
				data.client_id ?? null,
				data.quotation_id ?? null,
				data.contract_id ?? null,
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
			 RETURNING id, company_id, client_id, quotation_id, contract_id,
				date, amount::text AS amount, method, reference, status, notes, created_at, updated_at`,
			[requireCompanyId(ctx), id]
		);
		if (!result.rows[0]) throw new Error(`Pago ${id} no existe en esta empresa.`);
		return result.rows[0];
	}
}
