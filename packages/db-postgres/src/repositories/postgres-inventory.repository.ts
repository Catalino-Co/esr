import type { AvailabilityInput, InventoryAvailability, InventoryListFilters, RecordState, RepositoryContext, TenantCreateInventoryItemInput, TenantInventoryRepository } from '@esr/core';
import { DEFAULT_RECORD_STATE, requireCompanyId } from '@esr/core';
import type { ESRId, InventoryItem } from '@esr/schemas';
import type pg from 'pg';
import { getPostgresPool } from '../connection';
import { appendStateFilter } from './state-filter';
import { appendPagination } from './pagination';
import { availabilityColumnsSql, AVAILABILITY_ORDER_STATUSES, TOTAL_QUANTITY_SQL } from './availability';
import { withTransaction } from '../transaction';

export class PostgresInventoryRepository implements TenantInventoryRepository {
	constructor(private readonly pool: pg.Pool = getPostgresPool()) {}

	async findById(ctx: RepositoryContext, id: ESRId): Promise<InventoryItem | null> {
		const result = await this.pool.query<InventoryItem>(
			`SELECT i.*, ${availabilityColumnsSql(3)}
			 FROM items i WHERE i.company_id = $1 AND i.id = $2`,
			[requireCompanyId(ctx), id, AVAILABILITY_ORDER_STATUSES]
		);
		return result.rows[0] ?? null;
	}

	async list(ctx: RepositoryContext, filters: InventoryListFilters = {}): Promise<InventoryItem[]> {
		const params: unknown[] = [requireCompanyId(ctx)];
		const where = ['i.company_id = $1'];
		if (filters.search) {
			params.push(`%${filters.search}%`);
			where.push(`(i.name ILIKE $${params.length} OR i.internal_code ILIKE $${params.length})`);
		}
		if (filters.status) { params.push(filters.status); where.push(`i.status = $${params.length}`); }
		if (filters.category_id) { params.push(filters.category_id); where.push(`i.category_id = $${params.length}`); }
		// Sin estado explicito se listan solo los activos.
		appendStateFilter(params, where, filters.state, 'i.');
		// La disponibilidad viaja con cada articulo, calculada. Antes el listado
		// pintaba `items.available_quantity`, una columna que solo cambiaba si
		// alguien abria la ficha y la reescribia a mano.
		params.push(AVAILABILITY_ORDER_STATUSES);
		const result = await this.pool.query<InventoryItem>(
			`SELECT i.*, ${availabilityColumnsSql(params.length)}
			 FROM items i WHERE ${where.join(' AND ')}
			 ORDER BY i.name${appendPagination(params, filters)}`,
			params
		);
		return result.rows;
	}

	async create(ctx: RepositoryContext, data: TenantCreateInventoryItemInput): Promise<InventoryItem> {
		const result = await this.pool.query<InventoryItem>(
			`INSERT INTO items
				(company_id, internal_code, name, category_id, subcategory_id, description, item_type,
				 uses_serial, total_quantity, rental_price, status, notes, is_active)
			 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
			 RETURNING *`,
			[
				requireCompanyId(ctx), data.internal_code || null, data.name, data.category_id || null,
				data.subcategory_id || null, data.description || null, data.item_type || 'cantidad',
				data.uses_serial ? 1 : 0, data.total_quantity ?? 0,
				data.rental_price ?? 0, data.status || 'disponible', data.notes || null, data.is_active ?? 1
			]
		);
		return result.rows[0];
	}

	async update(ctx: RepositoryContext, id: ESRId, data: Partial<TenantCreateInventoryItemInput>): Promise<InventoryItem> {
		const current = await this.findById(ctx, id);
		if (!current) throw new Error(`Inventory item ${id} not found in company.`);
		const next = { ...current, ...data };
		const result = await this.pool.query<InventoryItem>(
			`UPDATE items SET internal_code = $3, name = $4, category_id = $5, subcategory_id = $6,
				description = $7, item_type = $8, uses_serial = $9, total_quantity = $10,
				rental_price = $11, status = $12, notes = $13, is_active = $14,
				supplier_id = $15, uom_id = $16, min_stock = $17
			 WHERE company_id = $1 AND id = $2 RETURNING *`,
			[
				requireCompanyId(ctx), id, next.internal_code || null, next.name, next.category_id || null,
				next.subcategory_id || null, next.description || null, next.item_type || 'cantidad',
				next.uses_serial ? 1 : 0, next.total_quantity ?? 0,
				next.rental_price ?? 0, next.status || 'disponible', next.notes || null, next.is_active ?? 1,
				next.supplier_id || null, next.uom_id || null, next.min_stock ?? 0
			]
		);
		return result.rows[0];
	}

	async setState(ctx: RepositoryContext, id: ESRId, state: RecordState): Promise<void> {
		await this.pool.query(
			'UPDATE items SET is_active = $3 WHERE company_id = $1 AND id = $2',
			[requireCompanyId(ctx), id, state]
		);
	}

	/**
	 * Disponibilidad de uno o de todos los articulos, opcionalmente acotada a
	 * una ventana de fechas.
	 *
	 * Sustituye a la version que sumaba `work_order_stock_reservations`, una
	 * tabla que solo se soltaba al cancelar la orden y que por eso llego a decir
	 * que habia 7 unidades comprometidas de un articulo del que existen 5.
	 */
	async findAvailableByDateRange(ctx: RepositoryContext, input: AvailabilityInput = {}): Promise<InventoryAvailability[]> {
		const params: unknown[] = [requireCompanyId(ctx)];
		const where = ['i.company_id = $1', 'i.is_active = 1'];
		if (input.item_id) {
			params.push(input.item_id);
			where.push(`i.id = $${params.length}`);
		}
		params.push(AVAILABILITY_ORDER_STATUSES);
		const statusParam = params.length;

		let startParam: number | undefined;
		let endParam: number | undefined;
		if (input.start_date && input.end_date) {
			params.push(input.start_date);
			startParam = params.length;
			params.push(input.end_date);
			endParam = params.length;
		}

		const result = await this.pool.query<InventoryAvailability>(
			`SELECT i.id AS item_id, ${availabilityColumnsSql(statusParam, startParam, endParam)}
			 FROM items i WHERE ${where.join(' AND ')}
			 ORDER BY i.name`,
			params
		);
		return result.rows;
	}

	/**
	 * Lo que queda libre de un articulo en una ventana, y si alcanza para lo
	 * pedido. Vivia en el repositorio de COTIZACIONES, que es donde nadie la
	 * buscaria: es una regla de inventario y la usan tanto la conversion de una
	 * cotizacion como la creacion directa de una orden.
	 */
	async checkAvailability(
		ctx: RepositoryContext,
		itemId: ESRId,
		quantity: number,
		startDate?: string,
		endDate?: string
	): Promise<{ ok: boolean; available: number }> {
		const filas = await this.findAvailableByDateRange(ctx, {
			item_id: itemId,
			start_date: startDate,
			end_date: endDate
		});
		const fila = filas[0];
		if (!fila) return { ok: false, available: 0 };
		const available = Number(fila.available_quantity || 0);
		return { ok: available >= quantity, available };
	}


	/**
	 * Fija las existencias de un articulo en UN almacen.
	 *
	 * Desde la migracion 019 el total de un articulo de cantidad es la SUMA de
	 * `item_stock`, asi que `items.total_quantity` dejo de moverlo. Este es el
	 * unico camino que lo cambia.
	 *
	 * No aplica a los serializados: alli la existencia son los seriales, y una
	 * fila aqui seria un segundo numero contradiciendo al primero.
	 */
	async setStock(
		ctx: RepositoryContext,
		itemId: ESRId,
		warehouseId: ESRId,
		quantity: number
	): Promise<void> {
		await this.pool.query(
			`INSERT INTO item_stock (company_id, item_id, warehouse_id, quantity)
			 VALUES ($1, $2, $3, $4)
			 ON CONFLICT (company_id, item_id, warehouse_id)
			 DO UPDATE SET quantity = EXCLUDED.quantity`,
			[requireCompanyId(ctx), itemId, warehouseId, Math.max(0, Math.trunc(Number(quantity) || 0))]
		);
	}

	/**
	 * El almacen por defecto de la empresa: el «Principal» que creo la migracion,
	 * o el primero activo si alguien lo renombro.
	 *
	 * Existe para que las pantallas que todavia no eligen almacen —la ficha del
	 * articulo, hasta la fase 2— tengan donde escribir.
	 */
	async defaultWarehouseId(ctx: RepositoryContext): Promise<ESRId | null> {
		const result = await this.pool.query<{ id: ESRId }>(
			`SELECT id FROM warehouses
			 WHERE company_id = $1 AND is_active = 1
			 ORDER BY CASE WHEN code = 'PRIN' THEN 0 ELSE 1 END, id
			 LIMIT 1`,
			[requireCompanyId(ctx)]
		);
		return result.rows[0]?.id ?? null;
	}

	/**
	 * El inventario TAL COMO SE MIRA: por almacen.
	 *
	 * Devuelve, por articulo, tres cifras que responden a preguntas distintas y
	 * conviene no confundir:
	 *
	 *   - `warehouse_quantity`  lo que hay EN ESTE ALMACEN
	 *   - `total_quantity`      lo que hay en TODA la empresa
	 *   - `available_quantity`  lo que queda libre tras lo que retienen las
	 *                           ordenes vivas, tambien de toda la empresa
	 *
	 * El almacen INFORMA y NO RESERVA, asi que la disponibilidad no se reparte:
	 * una orden compromete contra el total. Ver `availability.ts`.
	 *
	 * En un articulo SERIALIZADO lo que esta en un almacen son sus unidades, no
	 * una cantidad: por eso la primera rama cuenta `item_serials` y la segunda
	 * lee `item_stock`. Son dos modelos y mezclarlos daria dos numeros
	 * contradiciendose.
	 */
	async listByWarehouse(
		ctx: RepositoryContext,
		options: {
			warehouse_id?: ESRId | null;
			search?: string;
			category_id?: ESRId | null;
			/** Solo los que estan en cero o por debajo de su minimo. */
			low_stock?: boolean;
		} = {}
	): Promise<Array<InventoryItem & { warehouse_quantity: number; category_name: string | null; supplier_name: string | null; uom_abbr: string | null }>> {
		const params: unknown[] = [requireCompanyId(ctx)];
		const where = ['i.company_id = $1', 'i.is_active = 1'];

		if (options.search) {
			params.push(`%${options.search}%`);
			where.push(`(i.name ILIKE $${params.length} OR i.internal_code ILIKE $${params.length})`);
		}
		if (options.category_id) {
			params.push(options.category_id);
			where.push(`i.category_id = $${params.length}`);
		}

		params.push(AVAILABILITY_ORDER_STATUSES);
		const statusParam = params.length;

		params.push(options.warehouse_id ?? null);
		const warehouseParam = params.length;

		// Sin almacen elegido, la columna enseña el total de la empresa: es lo
		// unico honesto que se puede decir cuando no se ha elegido «donde».
		const cantidadEnAlmacen = `
			CASE
				WHEN $${warehouseParam}::bigint IS NULL THEN (${TOTAL_QUANTITY_SQL})
				WHEN i.item_type = 'serializado' THEN (
					SELECT COUNT(*)::int FROM item_serials s
					WHERE s.item_id = i.id AND s.company_id = i.company_id
					  AND s.warehouse_id = $${warehouseParam}::bigint
					  AND s.status NOT IN ('retirado', 'mantenimiento')
				)
				ELSE COALESCE((
					SELECT st.quantity FROM item_stock st
					WHERE st.item_id = i.id AND st.company_id = i.company_id
					  AND st.warehouse_id = $${warehouseParam}::bigint
				), 0)
			END`;

		// «Stock bajo» se compara contra el TOTAL de la empresa y no contra lo
		// disponible hoy: responde «hay que comprar mas», que es una decision de
		// compra. Un articulo con todo alquilado no es stock bajo, esta ocupado.
		if (options.low_stock) {
			where.push(`COALESCE(i.min_stock, 0) > 0 AND (${TOTAL_QUANTITY_SQL}) < COALESCE(i.min_stock, 0)`);
		}

		const result = await this.pool.query(
			`SELECT i.*, ${availabilityColumnsSql(statusParam)},
			        ${cantidadEnAlmacen} AS warehouse_quantity,
			        c.name AS category_name,
			        p.name AS supplier_name,
			        COALESCE(u.abbr, u.name) AS uom_abbr
			   FROM items i
			   LEFT JOIN categories c ON c.id = i.category_id AND c.company_id = i.company_id
			   LEFT JOIN suppliers p ON p.id = i.supplier_id AND p.company_id = i.company_id
			   LEFT JOIN units_of_measure u ON u.id = i.uom_id AND u.company_id = i.company_id
			  WHERE ${where.join(' AND ')}
			  ORDER BY i.name`,
			params
		);
		return result.rows as never;
	}

	/**
	 * Un movimiento de existencias: entrada, salida o ajuste.
	 *
	 * Las dos escrituras —mover la cantidad y dejar constancia— van en UNA
	 * transaccion. Si se hicieran sueltas, un fallo entre medias dejaria una de
	 * dos cosas: existencias movidas sin rastro de quien las movio, o un
	 * historial que miente sobre lo que hay.
	 *
	 * `ajuste` FIJA la cantidad; `entrada` y `salida` la suman y la restan. Se
	 * guarda siempre el DELTA en `stock_movements.quantity` —positivo o
	 * negativo—, para que el historial se pueda sumar sin interpretar el tipo.
	 *
	 * No aplica a los serializados: alli las existencias son sus unidades, y
	 * mover un numero no daria de alta ninguna. La pantalla lo deshabilita y
	 * esto lo rechaza, porque una accion es un endpoint y el boton no protege.
	 */
	async moveStock(
		ctx: RepositoryContext,
		input: {
			item_id: ESRId;
			warehouse_id: ESRId;
			type: 'entrada' | 'salida' | 'ajuste';
			quantity: number;
			notes?: string | null;
			user_id?: string | null;
		}
	): Promise<{ quantity: number; delta: number }> {
		const companyId = requireCompanyId(ctx);
		const pedida = Math.max(0, Math.trunc(Number(input.quantity) || 0));

		return withTransaction(async (client) => {
			const item = await client.query<{ item_type: string }>(
				'SELECT item_type FROM items WHERE company_id = $1 AND id = $2',
				[companyId, input.item_id]
			);
			if (!item.rows[0]) throw new Error('El artículo no existe.');
			if (item.rows[0].item_type === 'serializado') {
				throw new Error(
					'Las existencias de un artículo serializado son sus unidades: regístrelas o retírelas desde su ficha.'
				);
			}

			// `FOR UPDATE` y no una lectura suelta: dos entradas a la vez sobre el
			// mismo articulo se leerian el mismo valor de partida y una pisaria a
			// la otra.
			const actual = await client.query<{ quantity: number }>(
				`SELECT quantity FROM item_stock
				  WHERE company_id = $1 AND item_id = $2 AND warehouse_id = $3
				  FOR UPDATE`,
				[companyId, input.item_id, input.warehouse_id]
			);
			const antes = Number(actual.rows[0]?.quantity ?? 0);

			const despues =
				input.type === 'ajuste'
					? pedida
					: input.type === 'entrada'
						? antes + pedida
						: antes - pedida;

			// Las existencias no bajan de cero: no se puede sacar lo que no hay.
			if (despues < 0) {
				throw new Error(`No hay tanto que sacar: en este almacén hay ${antes}.`);
			}

			await client.query(
				`INSERT INTO item_stock (company_id, item_id, warehouse_id, quantity)
				 VALUES ($1, $2, $3, $4)
				 ON CONFLICT (company_id, item_id, warehouse_id)
				 DO UPDATE SET quantity = EXCLUDED.quantity`,
				[companyId, input.item_id, input.warehouse_id, despues]
			);

			await client.query(
				`INSERT INTO stock_movements
					(company_id, item_id, warehouse_id, user_id, type, quantity, notes)
				 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
				[
					companyId,
					input.item_id,
					input.warehouse_id,
					input.user_id || null,
					input.type,
					despues - antes,
					input.notes || null
				]
			);

			return { quantity: despues, delta: despues - antes };
		});
	}
}

