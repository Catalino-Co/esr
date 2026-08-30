/**
 * Impuesto de la cotizacion.
 *
 * UNA columna, y con tres lectores desde el primer dia: la tarjeta «Totales» de
 * la pantalla, `calculateQuoteTotals(items, discount, tax)` de @esr/core —la
 * misma funcion que usa el servidor de Cloud— y la fila «Impuesto» del PDF
 * compartido. Sin ella, las dos apps calculan el total con formulas distintas.
 *
 * Lo que Postgres tiene y AQUI NO se copia: `quote_number`, `valid_until`,
 * `confirmed_at`, `cancelled_at`, `company_id`, y `total`/`name`/`code` en las
 * lineas. Hoy no las leeria nadie, y una columna que nadie lee es deuda.
 * `total` ademas seria una segunda fuente de verdad frente a `quantity * price`.
 *
 * ADITIVA Y NEUTRA, y eso es un requisito y no un efecto colateral:
 * `ADD COLUMN ... DEFAULT 0` rellena las filas existentes con el valor por
 * defecto, asi que `total = subtotal - discount + 0` sigue dando exactamente el
 * total que ya estaba guardado. Esta migracion NO PUEDE mover el importe de
 * ningun documento emitido.
 */
module.exports = {
  version: '0006',
  name: 'quote_tax_amount',
  async up({ addColumnIfMissing, createIndexIfMissing }) {
    await addColumnIfMissing('quotations', 'tax_amount', 'REAL DEFAULT 0');

    // La pantalla lee las lineas por `quotation_id` cada vez que se abre una
    // cotizacion, y `initial-schema.cjs` no creo ningun indice sobre esa tabla:
    // hoy cada apertura es un escaneo completo.
    await createIndexIfMissing(
      'idx_quotation_items_quotation',
      'CREATE INDEX idx_quotation_items_quotation ON quotation_items (quotation_id)'
    );
  }
};
