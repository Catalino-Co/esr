import { writable } from 'svelte/store';

/**
 * Modal de confirmacion, para reemplazar el `confirm()` nativo del navegador.
 *
 * `ask()` devuelve una Promise: cada sitio que hoy escribe
 * `if (confirm('¿Eliminar?'))` pasa a `if (await confirmDialog.ask('¿Eliminar?'))`
 * sin reestructurar la funcion que lo rodea —ya son `async` porque llaman a
 * `window.api.*`—.
 *
 * Sin precedente en ninguna de las dos apps: es infraestructura nueva de
 * verdad, no un ensamblaje de piezas existentes.
 */
function createConfirmStore() {
	const { subscribe, set } = writable(null);
	/** @type {{ resolve: (v: boolean) => void } | null} */
	let pendiente = null;

	/**
	 * @param {string} message
	 * @param {{ title?: string, danger?: boolean, aceptar?: string, cancelar?: string }} [opts]
	 * @returns {Promise<boolean>}
	 */
	function ask(message, opts = {}) {
		return new Promise((resolve) => {
			pendiente = { resolve };
			set({
				message,
				title: opts.title ?? 'Confirmar',
				danger: opts.danger ?? false,
				aceptar: opts.aceptar ?? 'Aceptar',
				cancelar: opts.cancelar ?? 'Cancelar'
			});
		});
	}

	function responder(valor) {
		set(null);
		if (pendiente) {
			pendiente.resolve(valor);
			pendiente = null;
		}
	}

	return {
		subscribe,
		ask,
		accept: () => responder(true),
		cancel: () => responder(false)
	};
}

export const confirmDialog = createConfirmStore();
