import { writable } from 'svelte/store';

/**
 * La sesion de ESR Pro, en un store.
 *
 * Antes el usuario se leia de `sessionStorage` UNA sola vez, en el `onMount`
 * del layout raiz. Como el login navega con `goto()` —navegacion de cliente, el
 * layout no se vuelve a montar—, despues de iniciar sesion `user` se quedaba en
 * `null` para el resto de la sesion.
 *
 * Eso no se notaba mientras el menu no dependia del rol: la barra lateral
 * pintaba las doce entradas igual, y lo unico raro era que el pie dijera
 * «Usuario / Local» en vez del nombre. Al filtrar el menu por permisos, un
 * usuario sin rol no puede ver NADA y la barra lateral se quedo vacia.
 *
 * El store es la fuente unica: se inicializa de `sessionStorage`, y `entrar` /
 * `salir` escriben en los dos sitios a la vez.
 */
const CLAVE = 'esr_user';

function leerInicial() {
	if (typeof sessionStorage === 'undefined') return null;
	try {
		const crudo = sessionStorage.getItem(CLAVE);
		return crudo ? JSON.parse(crudo) : null;
	} catch {
		// Puede no existir durante el render del servidor, y el JSON puede estar
		// corrupto. Sin sesion es lo seguro: el layout manda al login.
		return null;
	}
}

export const sesion = writable(leerInicial());

/** Guarda la sesion recien iniciada y la publica al resto de la app. */
export function entrar(usuario) {
	try {
		sessionStorage.setItem(CLAVE, JSON.stringify(usuario));
	} catch {
		/* sin almacenamiento la sesion vive solo en memoria */
	}
	sesion.set(usuario);
}

/** Cierra la sesion en los dos sitios. */
export function salir() {
	try {
		sessionStorage.removeItem(CLAVE);
	} catch {
		/* nada que borrar */
	}
	sesion.set(null);
}
