import { writable } from 'svelte/store';

/**
 * Avisos que se autoocultan: éxito y aviso. El error grave NO vive aquí, va en
 * `dangerModal.js` — un toast que desaparece solo no sirve para un fallo que
 * el usuario tiene que atender antes de seguir.
 *
 * Mismo patrón factory que `theme.js`: `writable` envuelto, expuesto como
 * instancia unica. Gemelo del de Cloud.
 */

/** @typedef {'success' | 'warning' | 'info'} ToastType */

const DURACION = { success: 4000, warning: 6000, info: 5000 };
/**
 * Un toast con lista necesita mas tiempo de lectura que una linea suelta, sea
 * cual sea su tipo.
 */
const DURACION_CON_LISTA = 10000;

function createToastStore() {
	const { subscribe, update } = writable([]);
	let contador = 0;

	/**
	 * @param {ToastType} type
	 * @param {string | { message: string, items?: string[] }} input
	 */
	function push(type, input) {
		const { message, items } =
			typeof input === 'string' ? { message: input, items: undefined } : input;
		const id = ++contador;
		update((lista) => [...lista, { id, type, message, items }]);
		setTimeout(() => dismiss(id), items?.length ? DURACION_CON_LISTA : DURACION[type]);
	}

	function dismiss(id) {
		update((lista) => lista.filter((toast) => toast.id !== id));
	}

	return {
		subscribe,
		success: (input) => push('success', input),
		warning: (input) => push('warning', input),
		info: (input) => push('info', input),
		dismiss
	};
}

export const toasts = createToastStore();
