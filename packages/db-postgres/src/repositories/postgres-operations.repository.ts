import type { RepositoryContext } from '@esr/core';
import { requireCompanyId, todayISO } from '@esr/core';
import type { ChecklistItem, ChecklistType, ESRId, Incident } from '@esr/schemas';
import type pg from 'pg';
import { getPostgresPool } from '../connection';

export class PostgresChecklistRepository {
	constructor(private readonly pool: pg.Pool = getPostgresPool()) {}

	private db(client?: pg.PoolClient) {
		return client ?? this.pool;
	}

	async findByWorkOrder(ctx: RepositoryContext, workOrderId: ESRId, type: ChecklistType, client?: pg.PoolClient): Promise<ChecklistItem[]> {
		const companyId = requireCompanyId(ctx);
		const items = await this.db(client).query<{
			item_id: number;
			expected_quantity: number;
			item_name: string;
			internal_code: string;
		}>(
			`SELECT woi.id AS work_order_item_id, woi.item_id, woi.quantity AS expected_quantity,
				i.name AS item_name, i.internal_code
			 FROM work_order_items woi
			 JOIN items i ON i.id = woi.item_id AND i.company_id = woi.company_id
			 WHERE woi.company_id = $1 AND woi.work_order_id = $2`,
			[companyId, workOrderId]
		);

		const saved = await this.db(client).query<{
			item_id: number;
			actual_quantity: number;
			is_damaged: number;
			is_missing: number;
			notes: string;
		}>(
			`SELECT item_id, actual_quantity, is_damaged, is_missing, notes
			 FROM work_order_checklists
			 WHERE company_id = $1 AND work_order_id = $2 AND type = $3`,
			[companyId, workOrderId, type]
		);

		return items.rows.map((row) => {
			const existing = saved.rows.find((s) => s.item_id === row.item_id);
			return {
				item_id: row.item_id,
				item_name: row.item_name,
				internal_code: row.internal_code,
				expected_quantity: Number(row.expected_quantity || 0),
				actual_quantity: existing ? Number(existing.actual_quantity || 0) : 0,
				is_damaged: existing ? existing.is_damaged === 1 : false,
				is_missing: existing ? existing.is_missing === 1 : false,
				notes: existing?.notes || ''
			};
		});
	}

	async replaceForWorkOrder(
		ctx: RepositoryContext,
		workOrderId: ESRId,
		type: ChecklistType,
		items: ChecklistItem[],
		client?: pg.PoolClient
	): Promise<void> {
		const companyId = requireCompanyId(ctx);
		await this.db(client).query(
			'DELETE FROM work_order_checklists WHERE company_id = $1 AND work_order_id = $2 AND type = $3',
			[companyId, workOrderId, type]
		);
		for (const item of items) {
			await this.db(client).query(
				`INSERT INTO work_order_checklists
					(company_id, work_order_id, item_id, type, expected_quantity, actual_quantity, is_damaged, is_missing, notes)
				 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
				[
					companyId,
					workOrderId,
					item.item_id,
					type,
					item.expected_quantity,
					item.actual_quantity,
					item.is_damaged ? 1 : 0,
					item.is_missing ? 1 : 0,
					item.notes || ''
				]
			);
		}
	}
}

export class PostgresIncidentRepository {
	constructor(private readonly pool: pg.Pool = getPostgresPool()) {}

	private db(client?: pg.PoolClient) {
		return client ?? this.pool;
	}

	async list(ctx: RepositoryContext, filters: { work_order_id?: ESRId; limit?: number; offset?: number } = {}): Promise<Incident[]> {
		const params: unknown[] = [requireCompanyId(ctx)];
		const where = ['company_id = $1', 'is_active = 1'];
		if (filters.work_order_id) {
			params.push(filters.work_order_id);
			where.push(`work_order_id = $${params.length}`);
		}
		const result = await this.pool.query<Incident>(
			`SELECT * FROM incidents WHERE ${where.join(' AND ')} ORDER BY created_at DESC LIMIT ${filters.limit ?? 100} OFFSET ${filters.offset ?? 0}`,
			params
		);
		return result.rows;
	}

	async findById(ctx: RepositoryContext, id: ESRId): Promise<Incident | null> {
		const result = await this.pool.query<Incident>(
			'SELECT * FROM incidents WHERE company_id = $1 AND id = $2',
			[requireCompanyId(ctx), id]
		);
		return result.rows[0] ?? null;
	}

	async findByWorkOrderId(ctx: RepositoryContext, workOrderId: ESRId): Promise<Incident[]> {
		return this.list(ctx, { work_order_id: workOrderId, limit: 100, offset: 0 });
	}

	async create(ctx: RepositoryContext, data: Omit<Incident, 'id' | 'company_id'>, client?: pg.PoolClient): Promise<Incident> {
		const result = await this.db(client).query<Incident>(
			`INSERT INTO incidents
				(company_id, type, item_id, client_id, work_order_id, conduce_id, date, description, severity, estimated_cost, status, notes, is_active)
			 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 1)
			 RETURNING *`,
			[
				requireCompanyId(ctx),
				data.type,
				data.item_id || null,
				data.client_id || null,
				data.work_order_id || null,
				data.conduce_id || null,
				// `todayISO`, no `toISOString`: este ultimo da el dia UTC, y a las
				// 22h con -04:00 fecha la incidencia manana.
				data.date || todayISO(),
				data.description || '',
				data.severity || 'media',
				data.estimated_cost ?? 0,
				data.status || 'reportado',
				data.notes || null
			]
		);
		return result.rows[0];
	}

	/**
	 * Anula de golpe las incidencias que genero un conduce. Las usa la anulacion
	 * del conduce en modo operacion: si la devolucion no ocurrio, el daño que
	 * reporto tampoco.
	 */
	async voidByConduce(ctx: RepositoryContext, conduceId: ESRId, client?: pg.PoolClient): Promise<number> {
		const result = await this.db(client).query(
			`UPDATE incidents SET status = 'anulado'
			 WHERE company_id = $1 AND conduce_id = $2 AND status <> 'anulado'`,
			[requireCompanyId(ctx), conduceId]
		);
		return result.rowCount ?? 0;
	}

	async resolve(ctx: RepositoryContext, id: ESRId): Promise<Incident> {
		const result = await this.pool.query<Incident>(
			`UPDATE incidents SET status = 'resuelto' WHERE company_id = $1 AND id = $2 RETURNING *`,
			[requireCompanyId(ctx), id]
		);
		if (!result.rows[0]) throw new Error(`Incident ${id} not found.`);
		return result.rows[0];
	}

	async countOpenByWorkOrder(ctx: RepositoryContext, workOrderId: ESRId, client?: pg.PoolClient): Promise<number> {
		const result = await this.db(client).query<{ count: string }>(
			`SELECT COUNT(*)::text AS count FROM incidents
			 WHERE company_id = $1 AND work_order_id = $2 AND is_active = 1 AND status NOT IN ('resuelto', 'anulado')`,
			[requireCompanyId(ctx), workOrderId]
		);
		return Number(result.rows[0]?.count || 0);
	}
}

export class PostgresStockMovementRepository {
	constructor(private readonly pool: pg.Pool = getPostgresPool()) {}

	async create(
		ctx: RepositoryContext,
		data: {
			item_id: ESRId;
			work_order_id?: ESRId;
			work_order_item_id?: ESRId;
			movement_type: string;
			quantity: number;
			reference_type?: string;
			reference_id?: ESRId;
			notes?: string;
		},
		client?: pg.PoolClient
	): Promise<void> {
		const db = client ?? this.pool;
		await db.query(
			`INSERT INTO stock_movements
				(company_id, item_id, work_order_id, work_order_item_id, type, quantity, reference, notes)
			 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
			[
				requireCompanyId(ctx),
				data.item_id,
				data.work_order_id || null,
				data.work_order_item_id || null,
				data.movement_type,
				data.quantity,
				data.reference_type ? `${data.reference_type}:${data.reference_id ?? ''}` : null,
				data.notes || null
			]
		);
	}

	/**
	 * El historial de movimientos, con sus filtros.
	 *
	 * Conviven DOS familias y las dos se listan a proposito:
	 *
	 *   - las MANUALES —`entrada`, `salida`, `ajuste`— que escribe la pantalla
	 *     de Inventario;
	 *   - las OPERATIVAS —`delivered`, `returned`, `damaged`, `lost`,
	 *     `reverso_*`— que llevan escribiendo conduces y ordenes desde antes.
	 *
	 * Separarlas seria mentir sobre por que se movio el stock: al almacenero le
	 * da igual quien lo escribio, quiere saber que entro y que salio.
	 * `statusLabel` de `@esr/core` ya traduce los dos vocabularios.
	 *
	 * `user_id` es NULL en todo lo anterior a la fase 1 —no se guardaba—, y la
	 * pantalla lo enseña como «Sistema». Inventar un responsable seria peor.
	 */
	async list(
		ctx: RepositoryContext,
		filters: {
			item_id?: ESRId | null;
			warehouse_id?: ESRId | null;
			/** `YYYY-MM-DD`, ambos inclusive. */
			from?: string;
			to?: string;
			type?: string;
			limit?: number;
		} = {}
	): Promise<Array<Record<string, unknown>>> {
		const params: unknown[] = [requireCompanyId(ctx)];
		const where = ['m.company_id = $1'];

		if (filters.item_id) {
			params.push(filters.item_id);
			where.push(`m.item_id = $${params.length}`);
		}
		if (filters.warehouse_id) {
			params.push(filters.warehouse_id);
			where.push(`m.warehouse_id = $${params.length}`);
		}
		if (filters.type) {
			params.push(filters.type);
			where.push(`m.type = $${params.length}`);
		}
		if (filters.from) {
			params.push(filters.from);
			where.push(`m.created_at >= $${params.length}::date`);
		}
		if (filters.to) {
			// `< to + 1 dia` y no `<= to`: `created_at` es TIMESTAMPTZ y el filtro
			// llega como fecha, asi que con `<=` se perderia todo lo del ultimo dia
			// despues de medianoche.
			params.push(filters.to);
			where.push(`m.created_at < ($${params.length}::date + INTERVAL '1 day')`);
		}

		params.push(Math.min(500, Math.max(1, Number(filters.limit) || 200)));
		const limitParam = params.length;

		const result = await this.pool.query(
			`SELECT m.id, m.type, m.quantity, m.notes, m.created_at,
			        i.name AS item_name, i.internal_code AS item_code,
			        w.name AS warehouse_name,
			        u.name AS user_name
			   FROM stock_movements m
			   LEFT JOIN items i ON i.id = m.item_id AND i.company_id = m.company_id
			   LEFT JOIN warehouses w ON w.id = m.warehouse_id AND w.company_id = m.company_id
			   LEFT JOIN users u ON u.id = m.user_id
			  WHERE ${where.join(' AND ')}
			  ORDER BY m.created_at DESC, m.id DESC
			  LIMIT $${limitParam}`,
			params
		);
		return result.rows;
	}

	async listByWorkOrder(ctx: RepositoryContext, workOrderId: ESRId): Promise<Array<Record<string, unknown>>> {
		const result = await this.pool.query(
			`SELECT * FROM stock_movements WHERE company_id = $1 AND work_order_id = $2 ORDER BY created_at DESC`,
			[requireCompanyId(ctx), workOrderId]
		);
		return result.rows;
	}
}
