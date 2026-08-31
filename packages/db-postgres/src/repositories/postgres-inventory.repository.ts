import type { AvailabilityInput, InventoryAvailability, InventoryListFilters, InventoryStockFilters, ItemInventoryInput, RecordState, RepositoryContext, TenantCreateInventoryItemInput, TenantInventoryRepository } from '@esr/core';
import { DEFAULT_RECORD_STATE, requireCompanyId } from '@esr/core';
import type { ESRId, InventoryItem, InventoryStockRow, ItemInventory } from '@esr/schemas';
import type pg from 'pg';
import { getPostgresPool } from '../connection';
import { appendStateFilter } from './state-filter';
import { appendPagination } from './pagination';
import { availabilityColumnsSql, AVAILABILITY_ORDER_STATUSES, TOTAL_QUANTITY_SQL } from './availability';
import { withTransaction } from '../transaction';

/**
 * Las columnas del ARTICULO, enumeradas a mano en vez de `i.*`.
 *
 * No es pedanteria: `items` todavia guarda `total_quantity`, `status`, `min_stock`
 * y `location`, que se mudaron a `item_stock` y a `item_inventory` y solo siguen
 * ahi para poder volver atras. Un `SELECT i.*` las traeria de vuelta y cualquier
 * pantalla las pintaria tan tranquila, enseñando un dato congelado en el dia de
 * la migracion. Enumerar es lo que hace que el error se vea como `undefined` y
 * no como un numero plausible y falso.
 */
const ITEM_FIELDS = [
	'id', 'company_id', 'internal_code', 'name', 'category_id', 'subcategory_id',
	'description', 'item_type', 'uses_serial', 'rental_price', 'internal_cost',
	'supplier_id', 'uom_id', 'notes', 'is_active'
] as const;

/** Para un `SELECT` sobre `items i`. */
const ITEM_COLUMNS = ITEM_FIELDS.map((c) => `i.${c}`).join(', ');
/** Para un `RETURNING`, donde no hay alias. */
const ITEM_RETURNING = ITEM_FIELDS.join(', ');

export class PostgresInventoryRepository implements TenantInventoryRepository {
	constructor(private readonly pool: pg.Pool = getPostgresPool()) {}

	async findById(ctx: RepositoryContext, id: ESRId): Promise<InventoryItem | null> {
		const result = await this.pool.query<InventoryItem>(
			`SELECT ${ITEM_COLUMNS}, ${availabilityColumnsSql(3)}
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
		if (filters.category_id) { params.push(filters.category_id); where.push(`i.category_id = $${params.length}`); }
		// Sin estado explicito se listan solo los activos.
		appendStateFilter(params, where, filters.state, 'i.');
		// La disponibilidad viaja con cada articulo, calculada. Antes el listado
		// pintaba `items.available_quantity`, una columna que solo cambiaba si
		// alguien abria la ficha y la reescribia a mano.
		params.push(AVAILABILITY_ORDER_STATUSES);
		const result = await this.pool.query<InventoryItem>(
			`SELECT ${ITEM_COLUMNS}, ${availabilityColumnsSql(params.length)}
			 FROM items i WHERE ${where.join(' AND ')}
			 ORDER BY i.name${appendPagination(params, filters)}`,
			params
		);
		return result.rows;
	}

	/**
	 * Da de alta un ARTICULO. Nace SIN existencias, a proposito.
	 *
	 * El formulario de alta pedia una cantidad inicial y la escribia sin dejar
	 * rastro: aparecian cien sillas sin que nadie hubiera registrado su entrada.
	 * Ahora nace en cero y el stock entra por un movimiento, que si dice cuando,
	 * a que almacen, a que costo y quien lo hizo.
	 *
	 * Su fila de `item_inventory` se crea en la misma transaccion: sin ella, el
	 * articulo no aparece en Inventario hasta que alguien le ponga un minimo, y
	 * un articulo en cero tiene que verse igual que uno lleno.
	 */
	async create(ctx: RepositoryContext, data: TenantCreateInventoryItemInput): Promise<InventoryItem> {
		const companyId = requireCompanyId(ctx);
		return withTransaction(async (client) => {
			const result = await client.query<InventoryItem>(
				`INSERT INTO items
					(company_id, internal_code, name, category_id, subcategory_id, description, item_type,
					 uses_serial, rental_price, internal_cost, supplier_id, uom_id, notes, is_active)
				 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
				 RETURNING ${ITEM_RETURNING}`,
				[
					companyId, data.internal_code || null, data.name, data.category_id || null,
					data.subcategory_id || null, data.description || null, data.item_type || 'cantidad',
					data.uses_serial ? 1 : 0, data.rental_price ?? 0, data.internal_cost ?? 0,
					data.supplier_id || null, data.uom_id || null, data.notes || null, data.is_active ?? 1
				]
			);
			const item = result.rows[0];
			await client.query(
				`INSERT INTO item_inventory (company_id, item_id, min_stock, physical_status)
				 VALUES ($1, $2, 0, 'disponible')
				 ON CONFLICT (company_id, item_id) DO NOTHING`,
				[companyId, item.id]
			);
			return item;
		});
	}

	async update(ctx: RepositoryContext, id: ESRId, data: Partial<TenantCreateInventoryItemInput>): Promise<InventoryItem> {
		const current = await this.findById(ctx, id);
		if (!current) throw new Error(`Inventory item ${id} not found in company.`);
		const next = { ...current, ...data };
		// Ni `total_quantity`, ni `status`, ni `min_stock`: editar la ficha de un
		// articulo NO puede mover ni una unidad. Esa es la regla entera de esta
		// separacion, y aqui es donde se cumple o se rompe.
		const result = await this.pool.query<InventoryItem>(
			`UPDATE items SET internal_code = $3, name = $4, category_id = $5, subcategory_id = $6,
				description = $7, item_type = $8, uses_serial = $9,
				rental_price = $10, internal_cost = $11, notes = $12, is_active = $13,
				supplier_id = $14, uom_id = $15
			 WHERE company_id = $1 AND id = $2 RETURNING ${ITEM_RETURNING}`,
			[
				requireCompanyId(ctx), id, next.internal_code || null, next.name, next.category_id || null,
				next.subcategory_id || null, next.description || null, next.item_type || 'cantidad',
				next.uses_serial ? 1 : 0,
				next.rental_price ?? 0, next.internal_cost ?? 0, next.notes || null, next.is_active ?? 1,
				next.supplier_id || null, next.uom_id || null
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


	/*
	 * `setStock` y `defaultWarehouseId` VIVIAN AQUI y se han ido con la ficha del
	 * articulo, que era su unico llamador.
	 *
	 * Eran un camino para cambiar existencias SIN dejar movimiento, que es justo
	 * lo que esta separacion viene a cerrar. Dejarlos como metodos publicos «por
	 * si acaso» seria dejar la puerta abierta a que la proxima pantalla vuelva a
	 * escribir stock sin decir quien ni cuando. El unico camino es `moveStock`.
	 */

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
	 *
	 * El minimo, el estado fisico y la ubicacion vienen de `item_inventory` con
	 * un LEFT JOIN: un articulo dado de alta antes de la migracion 021, o creado
	 * por una via que no pase por `create`, no tiene fila alli y aun asi tiene
	 * que verse. Sin fila, minimo cero y «disponible», que es lo que decia su
	 * ficha en blanco.
	 */
	async listStock(
		ctx: RepositoryContext,
		filters: InventoryStockFilters = {}
	): Promise<InventoryStockRow[]> {
		const params: unknown[] = [requireCompanyId(ctx)];
		const where = ['i.company_id = $1', 'i.is_active = 1'];

		if (filters.search) {
			params.push(`%${filters.search}%`);
			where.push(`(i.name ILIKE $${params.length} OR i.internal_code ILIKE $${params.length})`);
		}
		if (filters.category_id) {
			params.push(filters.category_id);
			where.push(`i.category_id = $${params.length}`);
		}
		if (filters.physical_status) {
			params.push(filters.physical_status);
			where.push(`COALESCE(inv.physical_status, 'disponible') = $${params.length}`);
		}

		params.push(AVAILABILITY_ORDER_STATUSES);
		const statusParam = params.length;

		params.push(filters.warehouse_id ?? null);
		const warehouseParam = params.length;

		// Cuantas entradas mira la valoracion: 1 con «ultimo», 3 con «promedio3».
		// La regla viaja como un LIMITE y no como un `CASE`, porque el promedio de
		// una sola entrada es esa entrada: una consulta sirve para las dos reglas.
		params.push(filters.valuation_rule === 'promedio3' ? 3 : 1);
		const ruleParam = params.length;

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
		if (filters.low_stock) {
			where.push(
				`COALESCE(inv.min_stock, 0) > 0 AND (${TOTAL_QUANTITY_SQL}) < COALESCE(inv.min_stock, 0)`
			);
		}

		const result = await this.pool.query(
			`SELECT ${ITEM_COLUMNS}, ${availabilityColumnsSql(statusParam)},
			        ${cantidadEnAlmacen} AS warehouse_quantity,
			        COALESCE(inv.min_stock, 0) AS min_stock,
			        COALESCE(inv.physical_status, 'disponible') AS physical_status,
			        inv.location,
			        val.valuation_cost,
			        c.name AS category_name,
			        p.name AS supplier_name,
			        COALESCE(u.abbr, u.name) AS uom_abbr
			   FROM items i
			   LEFT JOIN item_inventory inv ON inv.item_id = i.id AND inv.company_id = i.company_id
			   LEFT JOIN categories c ON c.id = i.category_id AND c.company_id = i.company_id
			   LEFT JOIN suppliers p ON p.id = i.supplier_id AND p.company_id = i.company_id
			   LEFT JOIN units_of_measure u ON u.id = i.uom_id AND u.company_id = i.company_id
			   LEFT JOIN LATERAL (
			       SELECT AVG(m.unit_cost)::numeric(14, 2) AS valuation_cost
			         FROM (
			           SELECT sm.unit_cost FROM stock_movements sm
			            WHERE sm.company_id = i.company_id AND sm.item_id = i.id
			              AND sm.unit_cost IS NOT NULL AND sm.quantity > 0
			            ORDER BY sm.created_at DESC, sm.id DESC
			            LIMIT $${ruleParam}
			         ) m
			   ) val ON TRUE
			  WHERE ${where.join(' AND ')}
			  ORDER BY i.name`,
			params
		);
		return result.rows as never;
	}

	/**
	 * Las existencias de un articulo que no son cantidad.
	 *
	 * Devuelve valores incluso sin fila: un articulo anterior a la migracion 021
	 * no la tiene, y el formulario que lo edite tiene que poder abrirse igual.
	 */
	async findInventory(ctx: RepositoryContext, itemId: ESRId): Promise<ItemInventory | null> {
		const result = await this.pool.query<ItemInventory>(
			`SELECT item_id, company_id, min_stock, physical_status, location
			   FROM item_inventory WHERE company_id = $1 AND item_id = $2`,
			[requireCompanyId(ctx), itemId]
		);
		return (
			result.rows[0] ?? {
				item_id: itemId,
				min_stock: 0,
				physical_status: 'disponible',
				location: null
			}
		);
	}

	/**
	 * Fija minimo, estado fisico y ubicacion. NO mueve ni una unidad.
	 *
	 * `INSERT ... ON CONFLICT` y no un `UPDATE`: el articulo puede no tener fila
	 * todavia —los anteriores a la migracion 021 no la tienen— y exigirsela
	 * obligaria a cada pantalla a acordarse de crearla.
	 *
	 * El `SET` se arma con los campos que VIENEN en el objeto, y no con todos.
	 * Un `COALESCE(EXCLUDED.x, ...)` fijo haria imposible borrar la ubicacion,
	 * porque vaciarla y no tocarla llegarian aqui como el mismo NULL.
	 */
	async saveInventory(
		ctx: RepositoryContext,
		itemId: ESRId,
		data: ItemInventoryInput
	): Promise<void> {
		const companyId = requireCompanyId(ctx);
		const params: unknown[] = [companyId, itemId];
		const sets: string[] = [];

		const minStock =
			data.min_stock === undefined ? 0 : Math.max(0, Math.trunc(Number(data.min_stock) || 0));
		const estado = data.physical_status ?? 'disponible';
		const ubicacion = data.location ?? null;

		params.push(minStock, estado, ubicacion);
		if (data.min_stock !== undefined) sets.push('min_stock = EXCLUDED.min_stock');
		if (data.physical_status !== undefined) sets.push('physical_status = EXCLUDED.physical_status');
		if ('location' in data) sets.push('location = EXCLUDED.location');

		await this.pool.query(
			`INSERT INTO item_inventory (company_id, item_id, min_stock, physical_status, location)
			 VALUES ($1, $2, $3, $4, $5)
			 ON CONFLICT (company_id, item_id) DO ${sets.length ? `UPDATE SET ${sets.join(', ')}` : 'NOTHING'}`,
			params
		);
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
			user_id?: ESRId | null;
			/**
			 * Lo que costo la unidad EN ESTA ENTRADA. Copia, igual que el precio de
			 * una linea de cotizacion: cambiar `items.internal_cost` manana no puede
			 * reescribir lo que costo una compra de hace tres meses.
			 */
			unit_cost?: number | null;
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

			// El costo solo tiene sentido en lo que ENTRA: una salida no compra
			// nada, y un ajuste corrige un recuento. Guardarlo en los tres
			// ensuciaria la valoracion con numeros que no son precios de compra.
			//
			// NULL y no 0 cuando no se sabe: «costo cero» es un dato inventado, y
			// la valoracion prefiere decir «—» a decir una cifra falsa.
			const costo =
				input.type === 'entrada' && input.unit_cost !== null && input.unit_cost !== undefined
					? Number(input.unit_cost)
					: null;

			await client.query(
				`INSERT INTO stock_movements
					(company_id, item_id, warehouse_id, user_id, type, quantity, notes, unit_cost)
				 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
				[
					companyId,
					input.item_id,
					input.warehouse_id,
					input.user_id || null,
					input.type,
					despues - antes,
					input.notes || null,
					Number.isFinite(costo as number) ? costo : null
				]
			);

			return { quantity: despues, delta: despues - antes };
		});
	}
}

