import { writable } from 'svelte/store';

/**
 * El error GRAVE, el que se queda hasta que el usuario lo cierra.
 *
 * Un único error activo, no una cola: estos vienen de una accion que el
 * usuario acaba de disparar, y no hay que apilar dos a la vez en la practica.
 */
export type DangerError = { title: string; message: string } | null;

function createDangerModalStore() {
	const { subscribe, set } = writable<DangerError>(null);

	return {
		subscribe,
		show(message: string, title = 'Ha ocurrido un error') {
			set({ title, message });
		},
		close() {
			set(null);
		}
	};
}

export const dangerModal = createDangerModalStore();
