import type { ESRId } from '@esr/schemas';
import type { RepositoryContext } from '../shared/tenant';

export type ItemSerialStatus = 'disponible' | 'reservado' | 'entregado' | 'mantenimiento' | 'retirado' | string;

export type ItemSerial = {
	id?: ESRId | null;
	item_id: ESRId;
	serial_number: string;
	status?: ItemSerialStatus;
	/**
	 * En que almacen esta esta unidad. Sin el, la unidad existe para el total de
	 * la empresa pero no se cuenta en ningun almacen, que es como estaban los
	 * seriales dados de alta antes de esta reforma: visibles en una pantalla e
	 * invisibles en la otra.
	 */
	warehouse_id?: ESRId | null;
};

export type WorkOrderSerialAssignment = {
	work_order_id: ESRId;
	item_id: ESRId;
	serial_id: ESRId;
};

export interface SerialRepository {
	findByItem(itemId: ESRId): Promise<ItemSerial[]>;
	replaceItemSerials(itemId: ESRId, serials: ItemSerial[]): Promise<void>;
	assignToWorkOrder(assignments: WorkOrderSerialAssignment[]): Promise<void>;
	releaseFromWorkOrder(workOrderId: ESRId): Promise<void>;
}

export type SerialListFilters = { item_id?: ESRId; status?: ItemSerialStatus };

/** Serial con el articulo al que pertenece ya resuelto, para las pantallas. */
export type ItemSerialView = ItemSerial & {
	item_name?: string | null;
	work_order_id?: ESRId | null;
	warehouse_name?: string | null;
};

/**
 * Los seriales identifican unidades fisicas concretas. Su ciclo:
 *
 *   disponible -> (entrega) entregado -> (devolucion) disponible
 *
 * `mantenimiento` y `retirado` se marcan a mano y sacan la unidad de
 * circulacion sin borrarla: el historico de que salio a un evento sigue ahi.
 */
export interface TenantSerialRepository {
	list(ctx: RepositoryContext, filters?: SerialListFilters): Promise<ItemSerialView[]>;
	findByItem(ctx: RepositoryContext, itemId: ESRId): Promise<ItemSerialView[]>;
	/** Solo los que se pueden entregar ahora mismo. */
	listAvailableForItem(ctx: RepositoryContext, itemId: ESRId): Promise<ItemSerialView[]>;
	/**
	 * Da de alta una unidad EN UN ALMACEN. El almacen no es opcional: una unidad
	 * fisica esta en algun sitio, y sin decir donde no se cuenta en ninguno.
	 */
	create(ctx: RepositoryContext, itemId: ESRId, serialNumber: string, warehouseId: ESRId): Promise<ItemSerial>;
	setStatus(ctx: RepositoryContext, id: ESRId, status: ItemSerialStatus): Promise<ItemSerial>;
	/** Mueve la unidad a otro almacen. Devuelve el serial con el almacen anterior. */
	setWarehouse(ctx: RepositoryContext, id: ESRId, warehouseId: ESRId): Promise<{ serial: ItemSerial; from: ESRId | null }>;
	findBySerialNumber(ctx: RepositoryContext, itemId: ESRId, serialNumber: string): Promise<ItemSerial | null>;
	/** Cuenta los disponibles: de ahi sale la cantidad de un articulo serializado. */
	countByStatus(ctx: RepositoryContext, itemId: ESRId, status: ItemSerialStatus): Promise<number>;
	listByWorkOrder(ctx: RepositoryContext, workOrderId: ESRId): Promise<ItemSerialView[]>;
}
