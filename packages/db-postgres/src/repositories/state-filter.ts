import { DEFAULT_RECORD_STATE, type RecordStateFilter } from '@esr/core';

/**
 * Anade el filtro de estado de circulacion al WHERE de un listado.
 *
 * Acepta un estado o varios: los listados piden uno (la lista muestra un estado
 * concreto), pero los SELECTORES piden los seleccionables, porque un inactivo
 * sigue pudiendo elegirse con aviso y un archivado no.
 */
export function appendStateFilter(
	params: unknown[],
	where: string[],
	state: RecordStateFilter | undefined,
	alias = ''
): void {
	const value = state ?? DEFAULT_RECORD_STATE;
	params.push(value);
	where.push(
		Array.isArray(value)
			? `${alias}is_active = ANY($${params.length}::int[])`
			: `${alias}is_active = $${params.length}`
	);
}
