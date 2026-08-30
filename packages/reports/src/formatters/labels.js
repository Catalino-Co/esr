/**
 * Como se nombran las cosas dentro de un documento.
 */

/**
 * Etiqueta de una linea de cotizacion.
 *
 * Existe porque la MISMA cotizacion se escribia de tres formas: el listado de
 * Desktop ponia «[PAQUETE] X», su editor «📦 X» y Cloud el nombre pelado.
 *
 * Y el emoji no era solo una inconsistencia: las fuentes estandar de jsPDF son
 * WinAnsi y no pueden representar U+1F4E6, asi que ese «📦» llegaba al PDF y se
 * imprimia como un hueco. El nombre se guarda PELADO y el adorno se pone aqui,
 * al pintar.
 *
 * Desde que los paquetes se explotan en lineas de articulo, esto solo alcanza a
 * las filas HEREDADAS —`package_id` sin `item_id`— que no se migran y por tanto
 * van a seguir existiendo.
 */
export function quoteItemLabel(line) {
  const nombre = String(line?.name ?? '').trim() || 'Sin descripción';
  const esPaquete =
    line?.is_package === true || (line?.package_id != null && line?.item_id == null);
  return esPaquete ? `[Paquete] ${nombre}` : nombre;
}

/**
 * Numero visible de una cotizacion.
 *
 * Cloud numera con `quote_number` («COT-000001»); Desktop no tiene esa columna
 * y numera por el id. Una sola funcion, usada por la cabecera del documento Y
 * por el nombre del fichero, para que no puedan discrepar — que es lo que
 * pasaba: los dos hacian su propio `padStart(5)` escrito a mano y coincidian
 * por casualidad.
 */
export function quoteDocumentNumber(quotation) {
  const numero = String(quotation?.quote_number ?? '').trim();
  if (numero) return numero;
  return `#${String(quotation?.id ?? '').padStart(5, '0')}`;
}

/** Nombre de fichero seguro para el PDF de una cotizacion. */
export function quoteDocumentFilename(quotation) {
  // Se quitan `#`, espacios y cualquier cosa que un sistema de ficheros mire
  // raro; se conservan letras, digitos, guion y guion bajo.
  const limpio = quoteDocumentNumber(quotation).replace(/[^\w-]/g, '');
  return `Cotizacion_${limpio || 'sin-numero'}.pdf`;
}
