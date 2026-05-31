import { validateRentalOrderInput, type ESRId, type RentalOrderItem, type RentalOrderStatus } from '@esr/schemas';
import { fail, ok, type UseCaseResult } from '../shared/result';

export const RESERVED_RENTAL_STATUSES = ['preparado', 'cargado'] as const;

export function shouldReserveStock(status?: RentalOrderStatus | null): boolean {
	return RESERVED_RENTAL_STATUSES.includes(status as (typeof RESERVED_RENTAL_STATUSES)[number]);
}

export function planRentalOrderStatusForSave(input: {
	targetStatus?: RentalOrderStatus | null;
	originalStatus?: RentalOrderStatus | null;
}): { shouldReserve: boolean; statusForSave?: RentalOrderStatus | null } {
	const shouldReserve = shouldReserveStock(input.targetStatus) && !shouldReserveStock(input.originalStatus);

	return {
		shouldReserve,
		statusForSave: shouldReserve ? input.originalStatus : input.targetStatus
	};
}

export function mergeRentalOrderItem(
	items: RentalOrderItem[],
	item: Pick<RentalOrderItem, 'item_id' | 'name' | 'internal_code'> & { quantity: number }
): RentalOrderItem[] {
	const existing = items.find((line) => line.item_id === item.item_id);
	if (existing) {
		return items.map((line) =>
			line.item_id === item.item_id
				? { ...line, quantity: Number(line.quantity || 0) + Number(item.quantity || 0) }
				: line
		);
	}

	return [...items, { ...item }];
}

export function validateRentalOrderDraft(input: { client_id: ESRId | '' }): UseCaseResult<{ client_id: ESRId | '' }> {
	const validation = validateRentalOrderInput(input);
	if (!validation.valid) return fail(validation.issues[0] || 'rental_order.invalid');
	return ok(input);
}
