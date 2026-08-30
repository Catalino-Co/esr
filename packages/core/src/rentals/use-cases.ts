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

/**
 * ─── Orden sin cotizacion ────────────────────────────────────────────────
 *
 * El esquema siempre lo permitio —`work_orders.quotation_id` es nullable y no
 * tiene indice unico—, pero no habia por donde crearla. Estas reglas son las
 * que la cotizacion aplicaba de otra forma antes de convertirse.
 */

export type DirectOrderLine = {
	item_id: ESRId | '';
	quantity: number | string;
	price: number | string;
};

export type DirectOrderDraft = {
	client_id: ESRId | '';
	start_date?: string | null;
	end_date?: string | null;
	lines: readonly DirectOrderLine[];
};

/**
 * Una orden directa se crea CONFIRMADA y con sus lineas: no hay estado
 * borrador en `work_orders`, y sin lineas no habria nada que reservar ni que
 * preparar. Por eso se valida entera de una vez, no por partes.
 */
export function validateDirectOrderDraft(draft: DirectOrderDraft): UseCaseResult<true> {
	if (!draft.client_id) return fail('order.client.required');

	const utiles = draft.lines.filter((linea) => linea.item_id);
	if (!utiles.length) return fail('order.lines.required');

	for (const linea of utiles) {
		const cantidad = Number(linea.quantity);
		if (!Number.isFinite(cantidad) || cantidad <= 0) return fail('order.line.quantity_invalid');
		const precio = Number(linea.price);
		if (!Number.isFinite(precio) || precio < 0) return fail('order.line.price_invalid');
	}

	// Un mismo articulo dos veces reservaria dos veces contra el mismo stock y
	// dejaria la orden con dos lineas que la entrega trata por separado.
	const vistos = new Set<string>();
	for (const linea of utiles) {
		const clave = String(linea.item_id);
		if (vistos.has(clave)) return fail('order.line.duplicated');
		vistos.add(clave);
	}

	if (draft.start_date && draft.end_date && draft.end_date < draft.start_date) {
		return fail('order.dates.inverted');
	}

	return ok(true);
}

/** Mensajes de `validateDirectOrderDraft`, para no repetirlos en cada pantalla. */
export const DIRECT_ORDER_ERRORS: Record<string, string> = {
	'order.client.required': 'Elija el cliente.',
	'order.lines.required': 'Añada al menos un artículo.',
	'order.line.quantity_invalid': 'Las cantidades tienen que ser mayores que cero.',
	'order.line.price_invalid': 'Los precios no pueden ser negativos.',
	'order.line.duplicated': 'Hay un artículo repetido: súmelo en una sola línea.',
	'order.dates.inverted': 'La fecha de fin no puede ser anterior a la de inicio.'
};

export function directOrderErrorMessage(code: string | undefined): string {
	return DIRECT_ORDER_ERRORS[code ?? ''] ?? 'No se pudo crear la orden.';
}
