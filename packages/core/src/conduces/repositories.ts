import type { ESRId } from '@esr/schemas';

export type ConduceStatus = 'emitido' | 'entregado' | 'anulado' | string;

export type ConduceLine = {
	item_id: ESRId;
	quantity: number;
	price?: number;
	total?: number;
};

export type ConduceDraft = {
	id?: ESRId | null;
	work_order_id: ESRId | '';
	client_id?: ESRId | null;
	status?: ConduceStatus;
	subtotal?: number;
	discount?: number;
	total?: number;
	items?: ConduceLine[];
};

export interface ConduceRepository {
	findById(id: ESRId): Promise<ConduceDraft | null>;
	create(data: ConduceDraft): Promise<ConduceDraft>;
	update(id: ESRId, data: ConduceDraft): Promise<ConduceDraft>;
	replaceItems(conduceId: ESRId, items: ConduceLine[]): Promise<void>;
	updateStatus(id: ESRId, status: ConduceStatus): Promise<void>;
}
