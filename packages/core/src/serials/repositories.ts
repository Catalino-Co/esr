import type { ESRId } from '@esr/schemas';
import type { RepositoryContext } from '../shared/tenant';

export type ItemSerialStatus = 'disponible' | 'reservado' | 'entregado' | 'mantenimiento' | 'retirado' | string;

export type ItemSerial = {
	id?: ESRId | null;
	item_id: ESRId;
	serial_number: string;
	status?: ItemSerialStatus;
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
	create(ctx: RepositoryContext, itemId: ESRId, serialNumber: string): Promise<ItemSerial>;
	setStatus(ctx: RepositoryContext, id: ESRId, status: ItemSerialStatus): Promise<ItemSerial>;
	findBySerialNumber(ctx: RepositoryContext, itemId: ESRId, serialNumber: string): Promise<ItemSerial | null>;
	/** Cuenta los disponibles: de ahi sale la cantidad de un articulo serializado. */
	countByStatus(ctx: RepositoryContext, itemId: ESRId, status: ItemSerialStatus): Promise<number>;
	listByWorkOrder(ctx: RepositoryContext, workOrderId: ESRId): Promise<ItemSerialView[]>;
}
