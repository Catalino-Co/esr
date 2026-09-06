import type { RecordState, RecordStateFilter } from '../shared/record-state';
import type { ESRId, InventoryItem, InventoryStockRow, ItemInventory, ItemSupplier, ItemWarehouseStock, PhysicalStatus, ValuationRule } from '@esr/schemas';
import type { RepositoryContext } from '../shared/tenant';

/** Lo que se sabe al mover existencias de un articulo DE CANTIDAD. */
export type MoveStockInput = {
	item_id: ESRId;
	warehouse_id: ESRId;
	type: 'entrada' | 'salida' | 'ajuste';
	quantity: number;
	notes?: string | null;
	user_id?: ESRId | null;
	unit_cost?: number | null;
};

/** Lo que se sabe al trasladar existencias de un almacen a otro. */
export type TransferStockInput = {
	item_id: ESRId;
	from_warehouse_id: ESRId;
	to_warehouse_id: ESRId;
	quantity: number;
	notes?: string | null;
	user_id?: ESRId | null;
};

export type AvailabilityInput = {
	item_id?: ESRId;
	start_date?: string;
	end_date?: string;
};

export type InventoryAvailability = {
	item_id: ESRId;
	total_quantity: number;
	available_quantity: number;
	committed_quantity: number;
};

export type TenantCreateInventoryItemInput = Omit<InventoryItem, 'id' | 'company_id'>;

/**
 * Filtros del CATALOGO. Ni minimo ni estado fisico: eso es inventario y se
 * filtra en `InventoryStockFilters`.
 */
export type InventoryListFilters = {
	/** Estado de circulacion; por defecto, solo activos. */
	state?: RecordStateFilter; search?: string; category_id?: ESRId; limit?: number; offset?: number };

/** Filtros del INVENTARIO: los mismos del catalogo mas lo que solo el sabe. */
export type InventoryStockFilters = {
	/** Sin almacen, la cantidad que se devuelve es el total de la empresa. */
	warehouse_id?: ESRId | null;
	search?: string;
	category_id?: ESRId | null;
	physical_status?: PhysicalStatus;
	/** Solo los que estan por debajo de su minimo. */
	low_stock?: boolean;
	/** Como se calcula el costo con el que se valora el stock. Por defecto, `ultimo`. */
	valuation_rule?: ValuationRule;
	limit?: number;
	offset?: number;
};

/** Lo que se puede cambiar de las existencias sin mover ni una unidad. */
export type ItemInventoryInput = Partial<Omit<ItemInventory, 'item_id' | 'company_id'>>;

export interface InventoryRepository {
	findById(id: ESRId): Promise<InventoryItem | null>;
	findAvailableByDateRange(input: AvailabilityInput): Promise<InventoryAvailability[]>;
}

export interface TenantInventoryRepository {
	findById(ctx: RepositoryContext, id: ESRId): Promise<InventoryItem | null>;
	list(ctx: RepositoryContext, filters?: InventoryListFilters): Promise<InventoryItem[]>;
	create(ctx: RepositoryContext, data: TenantCreateInventoryItemInput): Promise<InventoryItem>;
	update(ctx: RepositoryContext, id: ESRId, data: Partial<TenantCreateInventoryItemInput>): Promise<InventoryItem>;
	/**
	 * Cambia el estado de circulacion. Sustituye al antiguo `deactivate()`, que
	 * fijaba 0 a pelo y no tenia inverso: con tres estados hace falta poder
	 * mover el registro en las dos direcciones.
	 */
	setState(ctx: RepositoryContext, id: ESRId, state: RecordState): Promise<void>;
	/**
	 * El inventario tal como se mira: por almacen, con el minimo y el estado
	 * fisico de cada articulo.
	 */
	listStock(ctx: RepositoryContext, filters?: InventoryStockFilters): Promise<InventoryStockRow[]>;
	/**
	 * Donde esta repartido UN articulo: una fila por almacen activo, las de cero
	 * incluidas. La vuelta de `listStock`, que fija el almacen y recorre los
	 * articulos.
	 */
	listStockByWarehouse(ctx: RepositoryContext, itemId: ESRId): Promise<ItemWarehouseStock[]>;
	/**
	 * Entrada, salida o ajuste EN UN ALMACEN. No aplica a serializados: alli las
	 * existencias son sus unidades, y mover un numero no moveria ninguna.
	 */
	moveStock(ctx: RepositoryContext, input: MoveStockInput): Promise<{ quantity: number; delta: number }>;
	/**
	 * Traslada cantidad de un almacen a otro EN UNA transaccion: dos asientos de
	 * bitacora (salida del origen, entrada del destino) que se dan juntos o no
	 * se da ninguno.
	 */
	transferStock(ctx: RepositoryContext, input: TransferStockInput): Promise<void>;
	/**
	 * Saca al articulo de un almacen donde ya no le queda nada. Solo procede con
	 * `quantity = 0`: no es un camino para borrar existencias, es limpiar un
	 * almacen que dejo de tener alguna.
	 */
	removeFromWarehouse(ctx: RepositoryContext, itemId: ESRId, warehouseId: ESRId): Promise<void>;
	/** Los proveedores registrados para UN articulo, el principal primero. */
	listSuppliersForItem(ctx: RepositoryContext, itemId: ESRId): Promise<ItemSupplier[]>;
	/** Agrega un proveedor a la lista del articulo. */
	addSupplier(ctx: RepositoryContext, itemId: ESRId, supplierId: ESRId, isPrimary?: boolean): Promise<void>;
	/** Quita un proveedor de la lista del articulo. */
	removeSupplier(ctx: RepositoryContext, itemId: ESRId, supplierId: ESRId): Promise<void>;
	/** Marca un proveedor como el preferido de ESE articulo; desmarca al resto. */
	setPrimarySupplier(ctx: RepositoryContext, itemId: ESRId, supplierId: ESRId): Promise<void>;
	/** Las existencias de un articulo que no son cantidad, sin tocar el catalogo. */
	findInventory(ctx: RepositoryContext, itemId: ESRId): Promise<ItemInventory | null>;
	/**
	 * Fija minimo, estado fisico y ubicacion. NO mueve existencias: para eso
	 * esta `moveStock`, que ademas deja constancia de quien las movio.
	 */
	saveInventory(ctx: RepositoryContext, itemId: ESRId, data: ItemInventoryInput): Promise<void>;
	findAvailableByDateRange(ctx: RepositoryContext, input: AvailabilityInput): Promise<InventoryAvailability[]>;
	/** Si alcanza lo libre de un articulo para lo pedido, en una ventana dada. */
	checkAvailability(
		ctx: RepositoryContext,
		itemId: ESRId,
		quantity: number,
		startDate?: string,
		endDate?: string
	): Promise<{ ok: boolean; available: number }>;
}
