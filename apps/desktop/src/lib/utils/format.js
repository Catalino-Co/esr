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
