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
  const esServicio = line?.is_service === true || line?.service_id != null;
  if (esServicio) return `[Servicio] ${nombre}`;
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

/**
 * Etiqueta de una linea de FACTURA.
 *
 * Casi `quoteItemLabel`, pero no se puede reutilizar tal cual: una linea de
 * factura guarda su texto en `description`, no en `name` -y una factura
 * ademas tiene un tercer caso que una cotizacion no tiene: el CARGO MANUAL,
 * ni articulo ni servicio, cuyo unico dato es ese texto y que por eso no
 * lleva ningun prefijo -es justo lo que lo distingue de los otros dos-.
 */
export function invoiceItemLabel(line) {
  const nombre = String(line?.description ?? '').trim() || 'Sin descripción';
  if (line?.service_id != null) return `[Servicio] ${nombre}`;
  if (line?.item_id == null) return nombre;
  const codigo = String(line?.internal_code ?? '').trim();
  return codigo ? `${nombre} (${codigo})` : nombre;
}

/** Numero visible de una factura. Espejo de `quoteDocumentNumber`. */
export function invoiceDocumentNumber(invoice) {
  const numero = String(invoice?.invoice_number ?? '').trim();
  if (numero) return numero;
  return `#${String(invoice?.id ?? '').padStart(5, '0')}`;
}

/** Nombre de fichero seguro para el PDF de una factura. */
export function invoiceDocumentFilename(invoice) {
  const limpio = invoiceDocumentNumber(invoice).replace(/[^\w-]/g, '');
  return `Factura_${limpio || 'sin-numero'}.pdf`;
}
