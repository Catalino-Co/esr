/**
 * Desenvuelve las respuestas del IPC de facturacion.
 *
 * `ipcRenderer.invoke` serializa un Error lanzado en el proceso principal
 * anteponiendole «Error invoking remote method 'x': Error: ». En facturas los
 * mensajes de negocio SON la interfaz —«esa entrega ya se facturó»— y no pueden
 * llegar con ese prefijo delante, asi que ese lado devuelve
 * `{ok: true, data}` / `{ok: false, error}` en vez de lanzar.
 *
 * `unwrap` vuelve a convertirlo en algo que se pueda usar con try/catch normal.
 */
export function unwrap(respuesta) {
	if (!respuesta) throw new Error('Sin respuesta del proceso principal.');
	if (respuesta.ok) return respuesta.data;
	throw new Error(respuesta.error || 'Error inesperado.');
}

/** Variante para pantallas que prefieren un valor por defecto a una excepcion. */
export function unwrapOr(respuesta, porDefecto) {
	return respuesta && respuesta.ok ? respuesta.data : porDefecto;
}
