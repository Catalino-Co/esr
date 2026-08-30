/**
 * Formatea un valor numérico como moneda con separador de miles y 2 decimales.
 * Ejemplo: 1500.5 → "1,500.50"
 * @param {number|string} value
 * @returns {string}
 */
export function fmt(value) {
  const num = Number(value) || 0;
  return num.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

/**
 * Formatea un número entero con separador de miles.
 * Ejemplo: 1500 → "1,500"
 * @param {number|string} value
 * @returns {string}
 */
export function fmtN(value) {
  const num = Number(value) || 0;
  return num.toLocaleString('en-US');
}

/**
 * Dinero de un DOCUMENTO, con simbolo de moneda.
 *
 * `fmt` se queda sin el porque lo usan tablas donde la cabecera de la columna
 * ya dice la moneda. Este es para las cifras sueltas: los totales de un PDF, la
 * fila de un documento imprimible.
 *
 * Hay DOS formateadores de dinero en el monorepo y es a proposito: este y
 * `formatMoney` de `@esr/core`, que va en `es-DO` con `Intl` y es el de la
 * PANTALLA. No se unifican: un documento imprimible no tiene tema ni idioma de
 * usuario, y meter `Intl` con el locale del navegador dentro de un PDF haria
 * que el mismo documento saliera distinto segun quien lo genere.
 *
 * Lo que si habia que unificar era el documento consigo mismo: el PDF ponia
 * `$`, el HTML imprimible no ponia nada y la pantalla `RD$`.
 *
 * OJO: el simbolo esta escrito a mano porque hoy no hay columna de moneda ni en
 * `company_info` ni en `companies`. El dia que la haya se lee de ahi y se pasa
 * por `companyInfo`; este es el unico sitio a tocar.
 */
export function fmtMoney(value) {
  return `RD$${fmt(value)}`;
}
