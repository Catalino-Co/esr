const { runQuery } = require('../../connection.cjs');

/**
 * Catalogo e inventario: trazar la frontera.
 *
 * Gemela de `021_item_inventory.sql` en Postgres. El minimo, el estado fisico y
 * la ubicacion salen de `items` y pasan a `item_inventory`, una fila por
 * articulo.
 *
 * DIFERENCIA DE FONDO con Cloud, la misma que trajo la 0009: en ESR Pro
 * `items.total_quantity` y `available_quantity` NO son un espejo, son el motor
 * —la disponibilidad se mantiene con `UPDATE ... available_quantity = ... - ?`
 * al reservar—. Esas dos columnas SE QUEDAN donde estan y siguen siendo el
 * motor; lo que desaparece es su presencia en el CATALOGO: ni se muestran, ni
 * se editan, ni se piden al crear un articulo. La regla que importa —editar la
 * ficha no altera existencias— se cumple igual.
 *
 * Aditiva y neutra: se copia lo que ya decia cada ficha, sin recalcular nada, y
 * las columnas viejas de `items` no se borran.
 */
module.exports = {
  version: '0010',
  name: 'item_inventory',
  async up({ addColumnIfMissing }) {
    // ── Existencias que no son cantidad ───────────────────────────────────
    await runQuery(`
      CREATE TABLE IF NOT EXISTS item_inventory (
        item_id INTEGER PRIMARY KEY,
        -- Comparado contra el TOTAL, no contra lo disponible hoy: un articulo
        -- con todo alquilado no es stock bajo, esta ocupado.
        min_stock INTEGER NOT NULL DEFAULT 0,
        -- «disponible» | «mantenimiento» | «retirado». Condicion FISICA, que
        -- no tiene nada que ver con is_active, que es si se puede cotizar.
        physical_status TEXT NOT NULL DEFAULT 'disponible',
        location TEXT,
        FOREIGN KEY (item_id) REFERENCES items(id)
      )
    `);

    // ── Volcado ───────────────────────────────────────────────────────────
    //
    // Una fila por articulo con exactamente lo que ya decia su ficha. Se copia,
    // no se recalcula.
    await runQuery(`
      INSERT OR IGNORE INTO item_inventory (item_id, min_stock, physical_status, location)
      SELECT id, COALESCE(min_stock, 0),
             COALESCE(NULLIF(status, ''), 'disponible'), location
        FROM items
    `);

    // ── Costo de cada entrada ─────────────────────────────────────────────
    //
    // Lo que valia la mercancia CUANDO ENTRO. Copia, igual que el precio de una
    // linea de cotizacion: cambiar `internal_cost` manana no puede reescribir
    // lo que costo una compra de hace tres meses.
    //
    // NULL a proposito y no 0: las entradas anteriores no traen costo, y decir
    // «costaron cero» seria inventarselo. La valoracion las muestra como «—».
    await addColumnIfMissing('stock_movements', 'unit_cost', 'REAL');

    // ── Regla de valoracion ───────────────────────────────────────────────
    //
    // `ultimo` o `promedio3`. Ajuste de empresa, junto a `default_tax_rate`.
    await addColumnIfMissing('company_info', 'default_valuation_rule', "TEXT DEFAULT 'ultimo'");
  }
};
