import { writable } from 'svelte/store';

/**
 * Avisos que se autoocultan: éxito y aviso. El error grave NO vive aquí, va en
 * `dangerModal.ts` — un toast que desaparece solo no sirve para un fallo que el
 * usuario tiene que atender antes de seguir.
 *
 * Mismo patrón factory que `theme.ts`: `writable` envuelto, expuesto como
 * instancia unica.
 */
export type ToastType = 'success' | 'warning' | 'info';

export type Toast = {
	id: number;
	type: ToastType;
	message: string;
	/** El parte de lote de cotizaciones es el único caso con lista, hoy. */
	items?: string[];
};

export type ToastInput = string | { message: string; items?: string[] };

const DURACION: Record<ToastType, number> = { success: 4000, warning: 6000, info: 5000 };
/**
 * Un toast con lista necesita mas tiempo de lectura que una linea suelta, sea
 * cual sea su tipo: «se quedaron fuera» puede traer varias cotizaciones y sus
 * motivos.
 */
const DURACION_CON_LISTA = 10000;

function createToastStore() {
	const { subscribe, update } = writable<Toast[]>([]);
	let contador = 0;

	function push(type: ToastType, input: ToastInput) {
		const { message, items } =
			typeof input === 'string' ? { message: input, items: undefined } : input;
		const id = ++contador;
		update((lista) => [...lista, { id, type, message, items }]);
		setTimeout(() => dismiss(id), items?.length ? DURACION_CON_LISTA : DURACION[type]);
	}

	function dismiss(id: number) {
		update((lista) => lista.filter((toast) => toast.id !== id));
	}

	return {
		subscribe,
		success: (input: ToastInput) => push('success', input),
		warning: (input: ToastInput) => push('warning', input),
		info: (input: ToastInput) => push('info', input),
		dismiss
	};
}

export const toasts = createToastStore();
