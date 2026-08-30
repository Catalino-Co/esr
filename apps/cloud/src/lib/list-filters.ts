import {
	RECORD_STATE,
	RECORD_STATE_FILTER_LABELS,
	RECORD_STATE_LABELS,
	RECORD_STATES,
	type RecordState
} from '@esr/core';

/**
 * Opciones del select de estado de circulación, iguales en las nueve pantallas.
 *
 * No hay opción «Todos» a propósito: la lista siempre muestra un estado
 * concreto, y la búsqueda respeta el seleccionado.
 */
export function stateOptions() {
	return RECORD_STATES.map((state) => ({
		value: state,
		label: RECORD_STATE_FILTER_LABELS[state],
		tone:
			state === RECORD_STATE.ACTIVE ? 'ok' : state === RECORD_STATE.INACTIVE ? 'warn' : 'off'
	}));
}

/**
 * Las mismas opciones para un FORMULARIO, en singular: el filtro dice
 * «Activos» porque habla de la lista, pero el campo dice «Activo» porque habla
 * de un registro.
 */
export function stateFormOptions() {
	return RECORD_STATES.map((state) => ({ value: state, label: RECORD_STATE_LABELS[state] }));
}

/** Select de estado listo para `<FilterBar>`. */
export function stateSelect(current: RecordState) {
	return {
		name: 'state',
		label: 'Estado del registro',
		value: String(current),
		options: stateOptions(),
		width: '9.5rem'
	};
}

/**
 * Select de estado de negocio. Es un eje distinto del de circulación: una
 * cotización puede estar aprobada y archivada a la vez.
 */
export function businessSelect(
	value: string,
	label: string,
	options: Array<{ value: string; label: string }>,
	width = '11rem'
) {
	return {
		name: 'status',
		label,
		value,
		options: [{ value: '', label }, ...options],
		width
	};
}
