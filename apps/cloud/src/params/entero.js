/**
 * Segmento de ruta que tiene que ser un ENTERO POSITIVO.
 *
 * No es cosmetico, es la diferencia entre un 404 y un 500.
 *
 * Todos los ids de Cloud son `BIGSERIAL`, asi que un segmento que no lo sea no
 * llega al repositorio como «no encontrada»: revienta en el driver de Postgres
 * con un `22P02` que nadie captura, y eso es un error del servidor donde tocaba
 * un «no existe». Se noto al convertir el alta de cotizaciones en un dialogo:
 * sin `/quotes/new` sombreando a `[id]`, un marcador viejo a esa direccion caia
 * aqui con `new` de id y devolvia un 500.
 *
 * Puesto en el router en vez de en cada `load`, la ruta ni se resuelve. Eso
 * protege de una vez a la pagina, a TODAS sus actions y a sus rutas hijas
 * —`document`, `print`—, que son POST y por tanto no pasan por el `load` donde
 * una guarda a mano se quedaria corta.
 *
 * Corre en el servidor y tambien en la navegacion de cliente.
 *
 * OJO al ampliarlo: vale para las diez rutas `[id]` porque las diez cuelgan de
 * tablas con id numerico. `company_id` en cambio es UUID; si algun dia hay una
 * ruta con ese eje, necesita su propio matcher, no este.
 *
 * @type {import('@sveltejs/kit').ParamMatcher}
 */
export function match(param) {
	return /^\d+$/.test(param);
}
