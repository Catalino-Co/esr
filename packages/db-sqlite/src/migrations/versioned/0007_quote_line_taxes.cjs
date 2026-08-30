const { getQuery, runQuery } = require('../../connection.cjs');

/**
 * Descuento e impuesto por LINEA de cotizacion, en porcentaje.
 *
 * Antes, `quotations.discount` y `quotations.tax_amount` eran dos importes
 * sueltos que se tecleaban en la cabecera de la ficha y no guardaban ninguna
 * relacion con lo cotizado: nadie podia decir de que salia ese impuesto. Ahora
 * cada linea lleva su tasa y la cabecera guarda la SUMA.
 *
 * Las columnas de la cabecera NO se borran: pasan de dato de entrada a
 * resultado calculado, que es lo que se imprime en el documento.
 *
 * Gemela de `017_quote_line_taxes.sql` en Postgres. Si una cambia, la otra
 * tambien: las dos apps comparten `calculateQuoteTotals`.
 */
module.exports = {
  version: '0007',
  name: 'quote_line_taxes',
  async up({ addColumnIfMissing }) {
    await addColumnIfMissing('quotation_items', 'discount_rate', 'REAL DEFAULT 0');
    await addColumnIfMissing('quotation_items', 'tax_rate', 'REAL DEFAULT 0');

    // ── Traspaso de las cotizaciones existentes ──────────────────────────
    //
    // Cada cotizacion con descuento o impuesto en la cabecera reparte esos
    // importes entre sus lineas como una tasa uniforme. Se elige el reparto
    // PROPORCIONAL y no cero porque asi el total recalculado coincide con el
    // que ya estaba guardado, salvo redondeo al centimo: un documento ya
    // enviado al cliente no puede cambiar de importe por una migracion.
    //
    // Va en JavaScript y no en un UPDATE ... FROM porque SQLite no lo tiene, y
    // un subselect correlacionado por cada fila seria ilegible. Son tantas
    // sentencias como cotizaciones con importes, y esto corre una sola vez.
    const cotizaciones = await getQuery(
      `SELECT q.id,
              q.discount AS descuento,
              q.tax_amount AS impuesto,
              SUM(COALESCE(qi.quantity, 0) * COALESCE(qi.price, 0)) AS bruto
         FROM quotations q
         JOIN quotation_items qi ON qi.quotation_id = q.id
        WHERE COALESCE(q.discount, 0) <> 0 OR COALESCE(q.tax_amount, 0) <> 0
        GROUP BY q.id, q.discount, q.tax_amount
       HAVING bruto > 0`
    );

    for (const cot of cotizaciones) {
      const bruto = Number(cot.bruto) || 0;
      const descuento = Number(cot.descuento) || 0;
      const impuesto = Number(cot.impuesto) || 0;
      const base = bruto - descuento;

      const tasaDescuento = Math.round(((descuento * 100) / bruto) * 1000) / 1000;
      // El impuesto va sobre la base YA rebajada, igual que en la formula. Con
      // un descuento del 100% no hay base y la tasa se queda en 0.
      const tasaImpuesto = base > 0 ? Math.round(((impuesto * 100) / base) * 1000) / 1000 : 0;

      await runQuery('UPDATE quotation_items SET discount_rate = ?, tax_rate = ? WHERE quotation_id = ?', [
        tasaDescuento,
        tasaImpuesto,
        cot.id
      ]);
    }
  }
};
