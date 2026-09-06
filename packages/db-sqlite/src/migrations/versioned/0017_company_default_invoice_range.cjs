/**
 * Rango por defecto del listado de facturas. Gemela de
 * `0014_company_default_order_range.cjs` y `0016_company_default_quote_range.cjs`,
 * ajuste APARTE de las otras dos.
 */
module.exports = {
  version: '0017',
  name: 'company_default_invoice_range',
  async up({ addColumnIfMissing }) {
    await addColumnIfMissing('company_info', 'default_invoice_range', "TEXT DEFAULT 'mes'");
  }
};
