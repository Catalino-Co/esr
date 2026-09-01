import { can as puedeElRol } from '@esr/core';

/**
 * Guardia de interfaz de ESR Pro.
 *
 * ⚠️ ESTO NO ES UNA BARRERA DE SEGURIDAD, Y NO PUEDE SERLO. ⚠️
 *
 * En Cloud el `can()` del cliente solo esconde botones y detras hay una barrera
 * de verdad: `requirePermission` se evalua en el servidor en cada `load` y cada
 * action. Aqui NO HAY SERVIDOR. Y el puente de Electron expone `db.run(sql)`
 * con SQL arbitrario al navegador, asi que cualquier cosa que se esconda aqui
 * se puede ejecutar desde la consola de desarrollo.
 *
 * Lo que esto SI hace, y es la mayor parte del valor: que cada quien vea lo
 * suyo y no se equivoque de pantalla. Lo que NO hace es impedir que alguien con
 * intencion lo salte.
 *
 * Cerrarlo de verdad significa convertir `db.run`/`db.get` en operaciones con
 * nombre validadas en el proceso principal, y eso toca las ~20 pantallas que
 * hoy escriben SQL crudo. Es una reforma propia, no un añadido.
 *
 * Segunda diferencia con Cloud, tambien deliberada: alli el cliente recibe del
 * servidor la lista de permisos YA RESUELTA y `can()` solo busca en ella. Aqui
 * no hay quien la resuelva, asi que se calcula desde el rol con la misma matriz
 * compartida de `@esr/core`.
 */

/**
 * El rol de la sesion, leido de `sessionStorage`.
 *
 * OJO: el rol se congela al iniciar sesion y NO se vuelve a leer de la base.
 * Cambiarle el rol a alguien surte efecto en su siguiente inicio de sesion.
 */
export function rolDeSesion() {
	try {
		const crudo = sessionStorage.getItem('esr_user');
		if (!crudo) return null;
		return JSON.parse(crudo)?.role ?? null;
	} catch {
		// `sessionStorage` puede no existir durante el render del servidor, y el
		// JSON puede estar corrupto. Sin rol no hay permisos, que es lo seguro.
		return null;
	}
}

/**
 * ¿Puede la sesion actual ejecutar `permiso`?
 * @param {string} permiso
 * @param {string | null} [rol] El rol, si quien llama ya lo tiene a mano.
 */
export function can(permiso, rol = undefined) {
	return puedeElRol(rol === undefined ? rolDeSesion() : rol, /** @type {any} */ (permiso));
}
