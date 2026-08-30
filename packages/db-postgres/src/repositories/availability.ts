import { ACTIVE_INVENTORY_ORDER_STATUSES } from '@esr/core';

/**
 * La ÚNICA cuenta de disponibilidad de ESR.
 *
 * Antes habia tres, y sobre el mismo articulo daban tres numeros distintos:
 *
 *   1. `items.available_quantity`, una columna guardada que se tecleaba en la
 *      ficha y que ninguna entrega ni devolucion actualizaba.
 *   2. `work_order_stock_reservations`, una tabla paralela que solo se soltaba
 *      al CANCELAR la orden: una orden entregada, devuelta y cerrada seguia
 *      apartando su mercancia para siempre.
 *   3. Esta derivacion, que era la unica que bloqueaba de verdad al crear una
 *      orden, y por tanto la unica que estaba obligada a ser correcta.
 *
 * Se queda la 3 y desaparecen las otras dos (migracion 015). La liberacion deja
 * de ser un paso que alguien tiene que acordarse de escribir: una orden
 * `devuelto` o `cerrado` sale de `ACTIVE_INVENTORY_ORDER_STATUSES` y deja de
 * contar sola.
 */

/** Estados de orden que retienen mercancia. Fuera de ellos, ya no se debe nada. */
export const AVAILABILITY_ORDER_STATUSES = [...ACTIVE_INVENTORY_ORDER_STATUSES];

/**
 * Existencias reales del articulo.
 *
 * En un articulo SERIALIZADO las existencias son sus unidades, no un numero
 * tecleado: `total_quantity` mentia en cuanto se registraba o se retiraba un
 * serial. Se descuentan los retirados (ya no existen) y los que estan en
 * mantenimiento (existen pero no se pueden alquilar). Los `entregado` SI
 * cuentan aqui: los descuenta el compromiso, y restarlos dos veces seria el
 * mismo error que se esta corrigiendo.
 */
export const TOTAL_QUANTITY_SQL = `
	CASE WHEN i.item_type = 'serializado'
		THEN (
			SELECT COUNT(*)::int FROM item_serials s
			WHERE s.item_id = i.id AND s.company_id = i.company_id
			  AND s.status NOT IN ('retirado', 'mantenimiento')
		)
		ELSE COALESCE(i.total_quantity, 0)
	END`;

/**
 * Lo que las ordenes vivas todavia retienen.
 *
 * `quantity - returned_quantity` y no `delivered - returned`: una orden
 * confirmada que aun no ha salido ya tiene la mercancia comprometida, y si se
 * mirase lo entregado se podria vender dos veces lo mismo antes de cargar el
 * camion.
 *
 * Solo se excluyen las lineas `cancelado`. La version anterior excluia tambien
 * las `devuelto`, lo que descontaba DOS veces: la resta ya deja en cero una
 * linea devuelta entera, mientras que excluirla por estado hacia desaparecer
 * tambien las PARCIALMENTE devueltas, que si retienen lo que falta por volver.
 *
 * `$1` es la empresa; `$${statusParam}` el array de estados. Las fechas, si se
 * pasan, acotan al solape con la ventana pedida.
 */
export function committedQuantitySql(statusParam: number, startParam?: number, endParam?: number): string {
	const solape =
		startParam && endParam
			? `AND COALESCE(woi.start_date, wo.date, '') <= $${endParam}
			   AND COALESCE(woi.end_date, wo.date, '') >= $${startParam}`
			: '';
	return `
	COALESCE((
		SELECT SUM(GREATEST(0, woi.quantity - COALESCE(woi.returned_quantity, 0)))
		FROM work_order_items woi
		INNER JOIN work_orders wo ON wo.id = woi.work_order_id AND wo.company_id = woi.company_id
		WHERE woi.item_id = i.id AND woi.company_id = i.company_id
		  AND wo.status = ANY($${statusParam}::text[])
		  AND wo.is_active = 1
		  AND woi.status <> 'cancelado'
		  ${solape}
	), 0)::int`;
}

/**
 * Las tres columnas juntas, listas para un SELECT sobre `items i`.
 *
 * `available` nunca baja de cero: un articulo sobrecomprometido —porque se
 * retiraron unidades que ya estaban en una orden— se enseña con cero
 * disponible, no en negativo.
 */
export function availabilityColumnsSql(
	statusParam: number,
	startParam?: number,
	endParam?: number
): string {
	const total = TOTAL_QUANTITY_SQL;
	const committed = committedQuantitySql(statusParam, startParam, endParam);
	return `
		${total} AS total_quantity,
		${committed} AS committed_quantity,
		GREATEST(0, (${total}) - (${committed}))::int AS available_quantity`;
}
