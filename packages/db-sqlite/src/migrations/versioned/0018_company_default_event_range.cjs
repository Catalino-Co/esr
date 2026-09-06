/**
 * Rango por defecto del listado de eventos. Gemela de
 * `0014_company_default_order_range.cjs`, `0016_company_default_quote_range.cjs`
 * y `0017_company_default_invoice_range.cjs`, ajuste APARTE de las otras tres.
 */
module.exports = {
  version: '0018',
  name: 'company_default_event_range',
  async up({ addColumnIfMissing }) {
    await addColumnIfMissing('company_info', 'default_event_range', "TEXT DEFAULT 'mes'");
  }
};
