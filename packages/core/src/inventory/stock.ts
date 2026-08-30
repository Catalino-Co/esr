/**
 * Lo que queda de las reglas de stock en el mundo TypeScript.
 *
 * Aqui vivian tambien `calculateCommittedStock`, `calculateAvailableStock`,
 * `findInsufficientStock` y `formatInsufficientStockDetail`. Nadie las llamaba
 * desde TypeScript, y desde que la disponibilidad tiene UNA sola cuenta
 * —`db-postgres/src/repositories/availability.ts`, que la calcula en SQL— ya no
 * habia nada que pudieran hacer: sumar compromisos en memoria exige traerse
 * antes todas las filas que la consulta ya agrega.
 *
 * CUIDADO al buscar usos en este paquete: `@esr/core` tiene exports
 * condicionales. `import` resuelve a `index.ts` (Cloud, y los Svelte de
 * Desktop) y `require` a `index.cjs`, que es una implementacion CommonJS
 * aparte con sus propias copias de estas funciones. Las de `index.cjs` SIGUEN
 * VIVAS: las usan `db-sqlite` y los tests de `packages/core/test`. Un grep que
 * solo mire `.ts` no ve ese mundo.
 */

/**
 * Estados de conduce que descuentan stock en ESR Pro Desktop.
 *
 * `entregado` es un estado de Desktop: en Cloud el conduce solo admite
 * `emitido`, `completado` y `anulado` desde el CHECK de la migracion 011.
 */
export const STOCK_DEDUCTING_CONDUCE_STATUSES = ['emitido', 'entregado'] as const;

export type StockDeductingConduceStatus = (typeof STOCK_DEDUCTING_CONDUCE_STATUSES)[number];

/** Lo usan dos pantallas de conduces de Desktop. */
export function shouldDeductStockForConduce(status?: string | null): status is StockDeductingConduceStatus {
	return STOCK_DEDUCTING_CONDUCE_STATUSES.includes(status as StockDeductingConduceStatus);
}
