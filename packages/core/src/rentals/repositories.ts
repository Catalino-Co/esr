import type { ESRId, RentalOrder, RentalOrderItem } from '@esr/schemas';

export type CreateRentalOrderInput = Omit<RentalOrder, 'id'> & {
	items: RentalOrderItem[];
};

export interface RentalOrderRepository {
	findById(id: ESRId): Promise<RentalOrder | null>;
	create(data: CreateRentalOrderInput): Promise<RentalOrder>;
	update(id: ESRId, data: Partial<RentalOrder>): Promise<RentalOrder>;
	listItems(orderId: ESRId): Promise<RentalOrderItem[]>;
	replaceItems(orderId: ESRId, items: RentalOrderItem[]): Promise<void>;
}
