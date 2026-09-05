/**
 * Rango por defecto del listado de cotizaciones. Gemela de
 * `0014_company_default_order_range.cjs`, ajuste APARTE del de ordenes.
 */
module.exports = {
  version: '0016',
  name: 'company_default_quote_range',
  async up({ addColumnIfMissing }) {
    await addColumnIfMissing('company_info', 'default_quote_range', "TEXT DEFAULT 'mes'");
  }
};
