/**
 * Rango por defecto del listado de ordenes.
 *
 * `mes` | `trimestre` | `anio`, siempre el que contiene el dia de hoy. Es lo que
 * la pantalla de ordenes carga cuando no hay fechas puestas.
 *
 * Ajuste de empresa, junto a `default_tax_rate` y `default_valuation_rule`. Con
 * `mes` por defecto, una instalacion que no lo configure ve la ventana mas
 * estrecha, que es la que hace util el listado.
 *
 * Gemela de `025_company_default_order_range.sql` en Postgres. Aditiva y neutra.
 */
module.exports = {
  version: '0014',
  name: 'company_default_order_range',
  async up({ addColumnIfMissing, createIndexIfMissing }) {
    await addColumnIfMissing('company_info', 'default_order_range', "TEXT DEFAULT 'mes'");
    // El listado pasa a filtrar SIEMPRE por rango de fecha y a ordenar por ella.
    // Gemelo de `026_work_orders_date_idx.sql` en Postgres.
    await createIndexIfMissing(
      'work_orders_date_idx',
      'CREATE INDEX work_orders_date_idx ON work_orders (date DESC, id DESC)'
    );
  }
};
