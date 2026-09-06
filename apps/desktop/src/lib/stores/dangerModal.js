import { writable } from 'svelte/store';

/**
 * El error GRAVE, el que se queda hasta que el usuario lo cierra. Gemelo del
 * de Cloud. Un unico error activo, no una cola.
 */
function createDangerModalStore() {
	const { subscribe, set } = writable(null);

	return {
		subscribe,
		/** @param {string} message @param {string} [title] */
		show(message, title = 'Ha ocurrido un error') {
			set({ title, message });
		},
		close() {
			set(null);
		}
	};
}

export const dangerModal = createDangerModalStore();
