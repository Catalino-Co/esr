import type { ESRId } from '@esr/schemas';

export type StockLine = {
	item_id: ESRId;
	quantity: number;
};

export type StockSnapshot = {
	item_id: ESRId;
	name?: string;
	internal_code?: string;
	total_quantity?: number;
	available_quantity: number;
};

export type InsufficientStockItem = StockLine & StockSnapshot;

export function calculateCommittedStock(reservations: StockLine[]): Map<ESRId, number> {
	const committed = new Map<ESRId, number>();

	for (const reservation of reservations) {
		committed.set(
			reservation.item_id,
			(committed.get(reservation.item_id) || 0) + Number(reservation.quantity || 0)
		);
	}

	return committed;
}

export function calculateAvailableStock(totalQuantity: number, committedQuantity: number): number {
	return Math.max(0, Number(totalQuantity || 0) - Number(committedQuantity || 0));
}

export function findInsufficientStock(
	requested: StockLine[],
	stock: StockSnapshot[]
): InsufficientStockItem[] {
	const stockById = new Map(stock.map((item) => [item.item_id, item]));

	return requested
		.map((line) => ({ ...line, ...stockById.get(line.item_id) }))
		.filter((line): line is InsufficientStockItem =>
			line.available_quantity !== undefined && Number(line.available_quantity) < Number(line.quantity)
		);
}

export function formatInsufficientStockDetail(items: Array<Pick<InsufficientStockItem, 'internal_code' | 'name'>>): string {
	return items
		.map((item) => `${item.internal_code || ''} ${item.name || ''}`.trim())
		.filter(Boolean)
		.join(', ');
}
