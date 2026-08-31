import type { RecordState, RecordStateFilter } from '../shared/record-state';
import type { ESRId, InventoryItem, InventoryStockRow, ItemInventory, PhysicalStatus, ValuationRule } from '@esr/schemas';
import type { RepositoryContext } from '../shared/tenant';

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
