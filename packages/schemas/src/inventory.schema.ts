import { invalid, isPresent, valid, type ESRId, type Nullable, type ValidationResult } from './shared';

export type InventoryItemType = 'cantidad' | 'serializado' | string;

/** Condicion FISICA de lo que hay. No confundir con `is_active`, ver abajo. */
export type PhysicalStatus = 'disponible' | 'mantenimiento' | 'retirado' | string;

/** Como se valora el stock a partir del costo de sus entradas. */
export type ValuationRule = 'ultimo' | 'promedio3';

/**
 * El ARTICULO: que es y cuanto vale.
 *
 * Aqui NO vive nada de existencias. El minimo, el estado fisico y la ubicacion
 * se fueron a `ItemInventory` (migracion 021 / 0010), y el total dejo de ser una
 * columna en la 019. Mientras vivian aqui, toda pantalla de catalogo que leyera
 * el articulo leia tambien existencias, y no habia forma de garantizar que
 * editar la ficha no las tocara.
 */
export type InventoryItem = {
	id?: Nullable<ESRId>;
	company_id?: string;
	internal_code?: string;
	name: string;
	category_id: ESRId | '';
	subcategory_id?: Nullable<ESRId> | '';
	description?: string;
	item_type?: InventoryItemType;
	uses_serial?: number | boolean;
	/**
	 * Derivados en cada consulta, NO columnas del articulo: el total es la suma
	 * de `item_stock` (o el recuento de seriales), `available = total -
	 * committed`, y `committed` es lo que retienen las ordenes vivas. Viajan con
	 * el articulo porque casi todo el que lo pide los necesita —cotizar, armar
	 * un paquete, crear una orden—, pero no se guardan en ninguna parte.
	 */
	total_quantity?: number;
	available_quantity?: number;
	committed_quantity?: number;
	/**
	 * Las dos TARIFAS VIGENTES. Son valores por defecto: cada transaccion COPIA
	 * el que necesita en el momento de hacerse —`quotation_items.price`,
	 * `stock_movements.unit_cost`— y cambiarlos aqui manana no reescribe ni una
	 * cotizacion emitida ni lo que costo una compra de hace tres meses.
	 */
	rental_price?: number;
	internal_cost?: number;
	/** Quien lo suministra. Apunta a `suppliers`, que ya tenia su CRUD. */
	supplier_id?: Nullable<ESRId>;
	/** Como se cuenta. Apunta a `units_of_measure`; su `abbr` acompaña a la cantidad. */
	uom_id?: Nullable<ESRId>;
	notes?: string;
	/**
	 * Estado de CIRCULACION: 1 activo, 2 inactivo, 0 archivado. Responde «¿se
	 * puede cotizar?», que es una decision comercial. Que la mercancia este rota
	 * o guardada en otro sitio es `ItemInventory.physical_status`, y son cosas
	 * distintas: un articulo inactivo puede tener existencias perfectas.
	 */
	is_active?: number;
};

/**
 * Las EXISTENCIAS de un articulo que no son una cantidad: cuanto deberia haber,
 * en que condicion esta y donde se guarda.
 *
 * Una fila por articulo, no por almacen. El minimo responde «hay que comprar
 * mas», que es una decision de compra de la empresa entera; y en un serializado
 * la condicion fina de cada unidad ya vive en `item_serials.status`.
 */
export type ItemInventory = {
	item_id: ESRId;
	company_id?: string;
	/** Comparado contra el TOTAL de la empresa, no contra lo disponible hoy. */
	min_stock?: number;
	physical_status?: PhysicalStatus;
	location?: Nullable<string>;
};

/**
 * Una fila del INVENTARIO tal como se mira: el articulo, sus existencias y las
 * etiquetas de los catalogos con los que se relaciona.
 *
 * `warehouse_quantity` es lo que hay EN EL ALMACEN ELEGIDO; `total_quantity`, lo
 * que hay en toda la empresa. Son preguntas distintas y conviene no mezclarlas.
 */
export type InventoryStockRow = InventoryItem &
	Omit<ItemInventory, 'item_id' | 'company_id'> & {
		warehouse_quantity?: number;
		category_name?: Nullable<string>;
		supplier_name?: Nullable<string>;
		uom_abbr?: Nullable<string>;
		/** Costo unitario segun la regla de valoracion, o `null` si no hay entradas con costo. */
		valuation_cost?: Nullable<number>;
	};

/**
 * Cuanto hay de UN articulo en UN almacen.
 *
 * Es la vuelta a `InventoryStockRow`: aquella fija el almacen y recorre los
 * articulos; esta fija el articulo y recorre los almacenes, que es la pregunta
 * «donde esta repartido esto». Se devuelven TODOS los almacenes activos,
 * incluidos los que estan en cero: saber que en un almacen no queda nada es
 * justo lo que se va a mirar.
 */
export type ItemWarehouseStock = {
	warehouse_id: ESRId;
	warehouse_name: string;
	quantity: number;
};

/**
 * Un proveedor registrado para UN articulo.
 *
 * `items.supplier_id` era un solo proveedor por articulo; esta es la tabla
 * puente que permite varios. `is_primary` es el preferido de ESE articulo, no
 * del catalogo de proveedores en general: el mismo proveedor puede ser
 * principal en un articulo y secundario en otro.
 */
export type ItemSupplier = {
	item_id: ESRId;
	supplier_id: ESRId;
	supplier_name: string;
	is_primary: boolean;
};

export function validateInventoryItemInput(item: Pick<InventoryItem, 'name' | 'category_id'>): ValidationResult {
	return isPresent(item.name) && isPresent(item.category_id) ? valid() : invalid('inventory_item.required_fields');
}
