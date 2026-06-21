import type { RentalOrderItem } from '@esr/schemas';
import { fail, ok, type UseCaseResult } from '../shared/result';

export const ORDER_PREPARE_FROM = ['confirmado'] as const;
export const ORDER_DELIVERY_FROM = ['confirmado', 'en_preparacion'] as const;
export const ORDER_RETURN_FROM = ['entregado', 'parcialmente_devuelto'] as const;
export const ORDER_CLOSE_FROM = ['devuelto'] as const;

export const ACTIVE_INVENTORY_ORDER_STATUSES = [
	'confirmado',
	'en_preparacion',
	'entregado',
	'parcialmente_devuelto'
] as const;

export const ACTIVE_INVENTORY_ITEM_STATUSES = [
	'reserved',
	'preparado',
	'entregado',
	'dañado',
	'perdido'
] as const;

export function validateOrderTransition(
	currentStatus: string | undefined,
	allowed: readonly string[]
): UseCaseResult<true> {
	if (!currentStatus || !allowed.includes(currentStatus as never)) {
		return fail('order.invalid_status_transition');
	}
	return ok(true);
}

export function getDeliverableQuantity(item: Pick<RentalOrderItem, 'quantity' | 'delivered_quantity'>): number {
	return Math.max(0, Number(item.quantity || 0) - Number(item.delivered_quantity || 0));
}

export function getReturnableQuantity(
	item: Pick<RentalOrderItem, 'delivered_quantity' | 'returned_quantity'>
): number {
	return Math.max(0, Number(item.delivered_quantity || 0) - Number(item.returned_quantity || 0));
}

export function canCloseOrder(
	items: Array<Pick<RentalOrderItem, 'quantity' | 'delivered_quantity' | 'returned_quantity' | 'status'>>,
	openIncidents: number
): UseCaseResult<true> {
	for (const item of items) {
		const delivered = Number(item.delivered_quantity || 0);
		const returned = Number(item.returned_quantity || 0);
		const reserved = Number(item.quantity || 0);
		if (delivered < reserved) return fail('order.items_pending_delivery');
		if (returned < delivered && !['dañado', 'perdido', 'devuelto'].includes(String(item.status || ''))) {
			return fail('order.items_pending_return');
		}
	}
	if (openIncidents > 0) return fail('order.open_incidents');
	return ok(true);
}

export function mapReturnConditionToItemStatus(condition: string): string {
	switch (condition) {
		case 'damaged':
		case 'dañado':
			return 'dañado';
		case 'lost':
		case 'perdido':
			return 'perdido';
		default:
			return 'devuelto';
	}
}
