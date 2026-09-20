/**
 * Facturacion independiente: la factura deja de nacer solo de una orden.
 * Gemela de `037_invoice_sources.sql` en Postgres.
 *
 * `invoices.tax_amount` ya existe aqui desde la 0003 -Cloud no lo tenia y se
 * cierra esa divergencia solo del lado de Postgres-. Lo que falta es el
 * origen "cotizacion" y su ledger de facturacion parcial.
 */
module.exports = {
  version: '0025',
  name: 'invoice_sources',
  async up({ runQuery, addColumnIfMissing, createIndexIfMissing }) {
    await addColumnIfMissing('invoices', 'quotation_id', 'INTEGER REFERENCES quotations(id)');
    await createIndexIfMissing(
      'idx_invoices_quotation',
      'CREATE INDEX idx_invoices_quotation ON invoices (quotation_id)'
    );

    // Tasas de linea, gemelas de `quotation_items` (migracion 0007). Facturar
    // una cotizacion DIRECTO necesita reproducir el precio y las tasas que el
    // cliente ya aprobo, no re-cotizar. `invoice_items.total` sigue siendo el
    // BRUTO; el descuento/impuesto se derivan con `calculateQuoteLineAmounts`.
    await addColumnIfMissing('invoice_items', 'discount_rate', 'REAL NOT NULL DEFAULT 0');
    await addColumnIfMissing('invoice_items', 'tax_rate',      'REAL NOT NULL DEFAULT 0');

    // Que linea de cotizacion cubre la factura, y CUANTO -a diferencia de
    // `invoice_work_order_items`, una cotizacion se factura por partes y mas
    // de una vez, asi que "ya se facturo" es una SUMA, no un si/no; el indice
    // por tanto no es unico. La carrera la frena la propia naturaleza single-
    // writer de SQLite, no un `SELECT ... FOR UPDATE` como en Postgres.
    await runQuery(`
      CREATE TABLE IF NOT EXISTS invoice_quotation_items (
        id                INTEGER PRIMARY KEY AUTOINCREMENT,
        invoice_id        INTEGER NOT NULL REFERENCES invoices(id),
        quotation_item_id INTEGER NOT NULL REFERENCES quotation_items(id),
        quantity          REAL    NOT NULL DEFAULT 0,
        is_active         INTEGER NOT NULL DEFAULT 1
      )
    `);
    await createIndexIfMissing(
      'invoice_quote_items_line_idx',
      'CREATE INDEX invoice_quote_items_line_idx ON invoice_quotation_items (quotation_item_id) WHERE is_active = 1'
    );
    await createIndexIfMissing(
      'invoice_quote_items_invoice_idx',
      'CREATE INDEX invoice_quote_items_invoice_idx ON invoice_quotation_items (invoice_id)'
    );
  }
};
