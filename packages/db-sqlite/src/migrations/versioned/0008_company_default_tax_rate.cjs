/**
 * Impuesto por defecto de la empresa, en PORCENTAJE.
 *
 * Desde que el descuento y el impuesto salen de cada linea (migracion 0007),
 * una cotizacion de veinte lineas con el mismo ITBIS obligaba a teclear «18»
 * veinte veces: no habia tasa por defecto en ningun sitio del sistema. Esta
 * columna la fija en Configuracion › Generales y la propone en cada linea
 * nueva.
 *
 * PROPONE, no impone: la linea la puede corregir, y cambiar este valor NO toca
 * ninguna cotizacion ya hecha.
 *
 * Gemela de `018_company_default_tax_rate.sql` en Postgres. Aditiva y neutra:
 * con DEFAULT 0, una instalacion que no la configure se comporta como hasta
 * ahora.
 */
module.exports = {
  version: '0008',
  name: 'company_default_tax_rate',
  async up({ addColumnIfMissing }) {
    await addColumnIfMissing('company_info', 'default_tax_rate', 'REAL DEFAULT 0');
  }
};
