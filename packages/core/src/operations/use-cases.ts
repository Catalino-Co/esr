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

/**
 * ─── Deshacer una entrega o una devolucion ───────────────────────────────
 *
 * Espejo de las reglas de arriba. Se escriben aparte y no se reutilizan las de
 * ida porque la ida SUMA sobre lo que ya habia, mientras que deshacer tiene que
 * recalcular desde lo que QUEDA: al anular una de varias devoluciones, el
 * estado del articulo no vuelve al anterior, se recalcula con las que siguen
 * vivas.
 */

/** De menos a mas grave. Al recalcular manda la peor condicion que quede. */
const RETURN_SEVERITY: Record<string, number> = { devuelto: 0, 'dañado': 1, perdido: 2 };

/**
 * Estado que le queda a una linea de la orden despues de anular un conduce.
 *
 * `conditions` son las condiciones de las devoluciones que SIGUEN vivas. Si no
 * queda ninguna, el estado sale de las cantidades.
 */
export function recalcItemStatusAfterCancel(
	item: { quantity: number | string; delivered: number; returned: number },
	conditions: readonly string[]
): string {
	if (item.returned > 0 && conditions.length) {
		return conditions.reduce((peor, actual) => {
			const normalizada = mapReturnConditionToItemStatus(actual);
			return (RETURN_SEVERITY[normalizada] ?? 0) > (RETURN_SEVERITY[peor] ?? 0) ? normalizada : peor;
		}, 'devuelto');
	}
	if (item.returned > 0) return 'devuelto';
	if (item.delivered >= Number(item.quantity || 0) && item.delivered > 0) return 'entregado';
	// Sin nada entregado el articulo vuelve a donde lo dejo `prepareOrder`.
	return 'preparado';
}

/**
 * Estado que le queda a la ORDEN. Es el mismo arbol que usan `completeDelivery`
 * y `completeReturn`, recorrido entero en vez de por su rama.
 */
export function recalcOrderStatusAfterCancel(
	items: ReadonlyArray<{ quantity: number | string; delivered: number; returned: number }>
): string {
	const algoEntregado = items.some((item) => item.delivered > 0);
	if (!algoEntregado) return 'en_preparacion';

	const algoDevuelto = items.some((item) => item.returned > 0);
	if (algoDevuelto) {
		const todoDevuelto = items.every((item) => item.returned >= item.delivered);
		return todoDevuelto ? 'devuelto' : 'parcialmente_devuelto';
	}

	const todoEntregado = items.every((item) => item.delivered >= Number(item.quantity || 0));
	return todoEntregado ? 'entregado' : 'en_preparacion';
}

/**
 * Una entrega no se puede deshacer si lo entregado ya se devolvio: quedaria una
 * linea con mas devuelto que entregado. Hay que anular antes la devolucion.
 */
export function canRevertDeliveredQuantity(
	item: { delivered: number; returned: number },
	quantity: number
): UseCaseResult<true> {
	if (item.delivered - quantity < 0) return fail('conduce.revert.delivered_underflow');
	if (item.delivered - quantity < item.returned) return fail('conduce.revert.returned_first');
	return ok(true);
}

/** Estados de orden en los que ya no se toca nada hacia atras. */
export const ORDER_STATUSES_FROZEN = ['cerrado', 'cancelado'] as const;
