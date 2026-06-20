import type { ESRId } from '@esr/schemas';

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
