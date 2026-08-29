/**
 * Estado de circulacion de un registro. Es un eje INDEPENDIENTE del estado de
 * negocio: una cotizacion puede estar `aprobada` (negocio) y `archivada`
 * (circulacion) a la vez.
 *
 * Los valores numericos son los que ESR Pro Desktop ya usa en produccion, para
 * que las dos apps hablen el mismo idioma sobre la misma columna `is_active`.
 * Ojo con el 0: no significa "falso", significa "archivado".
 */
export const RECORD_STATE = {
	/** Retirado de circulacion. Sustituye al borrado: la fila permanece. */
	ARCHIVED: 0,
	ACTIVE: 1,
	/** Pausa reversible: sigue existiendo y puede volver a activarse. */
	INACTIVE: 2
} as const;

export type RecordState = (typeof RECORD_STATE)[keyof typeof RECORD_STATE];

/** Lo que se ve al entrar en cualquier listado. */
export const DEFAULT_RECORD_STATE: RecordState = RECORD_STATE.ACTIVE;

export const RECORD_STATE_LABELS: Record<RecordState, string> = {
	[RECORD_STATE.ACTIVE]: 'Activo',
	[RECORD_STATE.INACTIVE]: 'Inactivo',
	[RECORD_STATE.ARCHIVED]: 'Archivado'
};

/** Etiqueta del filtro, en plural. */
export const RECORD_STATE_FILTER_LABELS: Record<RecordState, string> = {
	[RECORD_STATE.ACTIVE]: 'Activos',
	[RECORD_STATE.INACTIVE]: 'Inactivos',
	[RECORD_STATE.ARCHIVED]: 'Archivados'
};

/** Orden en que se ofrecen: del mas usado al menos. */
export const RECORD_STATES: RecordState[] = [
	RECORD_STATE.ACTIVE,
	RECORD_STATE.INACTIVE,
	RECORD_STATE.ARCHIVED
];

export function isRecordState(value: unknown): value is RecordState {
	return value === 0 || value === 1 || value === 2;
}

/**
 * Lee el estado de un parametro de URL. Cualquier cosa que no sea un estado
 * valido cae en el por defecto: un `?state=basura` no debe vaciar la lista.
 */
export function parseRecordState(value: string | null | undefined): RecordState {
	if (value === null || value === undefined || value === '') return DEFAULT_RECORD_STATE;
	const parsed = Number(value);
	return isRecordState(parsed) ? parsed : DEFAULT_RECORD_STATE;
}

export function recordStateLabel(value: unknown): string {
	return isRecordState(value) ? RECORD_STATE_LABELS[value] : '—';
}

/**
 * Un archivado desaparece de todo selector; un inactivo sigue ofreciendose,
 * porque su pausa es temporal y puede seguir usandose con aviso.
 */
export const SELECTABLE_STATES: RecordState[] = [RECORD_STATE.ACTIVE, RECORD_STATE.INACTIVE];

export function isSelectableState(value: unknown): boolean {
	return value === RECORD_STATE.ACTIVE || value === RECORD_STATE.INACTIVE;
}

/**
 * Lo que aceptan los filtros de los repositorios: un estado concreto, o varios
 * cuando se quiere ofrecer mas de uno (el caso de los selectores).
 */
export type RecordStateFilter = RecordState | RecordState[];

/** Clase de badge del sistema de diseño para cada estado. */
export function recordStateBadgeClass(value: unknown): string {
	if (value === RECORD_STATE.ACTIVE) return 'badge-active';
	if (value === RECORD_STATE.INACTIVE) return 'badge-warning';
	return 'badge-inactive';
}
