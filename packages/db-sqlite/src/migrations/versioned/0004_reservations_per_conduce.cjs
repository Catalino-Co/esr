/**
 * La reserva de stock deja de ser «una por orden» y pasa a saber quien la hizo.
 *
 * El problema: `reserveConduceStock` comprobaba si la ORDEN ya tenia alguna
 * reserva y, si la tenia, salia con `already_reserved` sin descontar nada.
 * Sumado al `UNIQUE(work_order_id, item_id)` de la tabla, eso significaba que
 * **el segundo conduce de una orden nunca descontaba stock**. Con entregas
 * parciales —que es justo lo que promueve el modulo de facturas, donde una
 * factura cubre varias entregas— el inventario se quedaba corto en silencio.
 *
 * La solucion no es quitar esa comprobacion sin mas: hay DOS mecanismos que
 * apartan mercancia y se solapan.
 *
 *   1. La ORDEN, al pasar a `preparado` o `cargado`, aparta todas sus lineas.
 *   2. El CONDUCE, al emitirse o entregarse, descuenta las suyas.
 *
 * Si la orden ya aparto el total, que el conduce descuente otra vez seria
 * contarlo dos veces. Por eso la tabla gana `conduce_id`:
 *
 *   `conduce_id IS NULL`      -> lo aparto la orden, cubre todas sus lineas.
 *   `conduce_id = N`          -> lo descontó el conduce N.
 *
 * Y con eso las reglas quedan claras: la orden aparta una sola vez; cada
 * conduce descuenta una sola vez; y un conduce no descuenta si la orden ya
 * aparto el total.
 *
 * Hay que reconstruir la tabla porque `UNIQUE(work_order_id, item_id)` es una
 * restriccion EN LINEA, y en SQLite eso crea un indice automatico que no se
 * puede borrar. Es el baile de siempre: tabla nueva, copiar, borrar, renombrar.
 * `PRAGMA foreign_keys` esta apagado en esta aplicacion, asi que el DROP no
 * dispara cascadas.
 */
module.exports = {
  version: '0004',
  name: 'reservations_per_conduce',
  async up({ createIndexIfMissing, columnExists, runQuery, tableExists }) {
    if (!(await tableExists('work_order_stock_reservations'))) return;
    // Idempotencia: si ya se aplico, no rehacer el baile.
    if (await columnExists('work_order_stock_reservations', 'conduce_id')) return;

    await runQuery(`
      CREATE TABLE work_order_stock_reservations_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        work_order_id INTEGER NOT NULL,
        item_id INTEGER NOT NULL,
        conduce_id INTEGER,
        quantity INTEGER NOT NULL DEFAULT 1,
        status TEXT DEFAULT 'reserved',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(work_order_id) REFERENCES work_orders(id),
        FOREIGN KEY(item_id) REFERENCES items(id),
        FOREIGN KEY(conduce_id) REFERENCES conduces(id)
      )
    `);

    // Las filas que ya existen se quedan con `conduce_id` a NULL, es decir,
    // como reserva de ORDEN. No se puede saber cual la creo —la tabla nunca lo
    // guardo— y tratarlas como compromiso de la orden entera conserva el
    // comportamiento actual: un conduce nuevo sobre esa orden seguira sin
    // descontar, que es lo que pasa hoy. Inventar una atribucion seria peor.
    await runQuery(`
      INSERT INTO work_order_stock_reservations_new
        (id, work_order_id, item_id, conduce_id, quantity, status, created_at)
      SELECT id, work_order_id, item_id, NULL, quantity, status, created_at
      FROM work_order_stock_reservations
    `);

    await runQuery('DROP TABLE work_order_stock_reservations');
    await runQuery(
      'ALTER TABLE work_order_stock_reservations_new RENAME TO work_order_stock_reservations'
    );

    // Dos indices PARCIALES en vez de un UNIQUE de tres columnas: en SQLite los
    // NULL se consideran distintos entre si, asi que `UNIQUE(wo, item,
    // conduce_id)` dejaria meter varias reservas de orden para el mismo
    // articulo. Separandolos, cada mecanismo tiene su propia unicidad.
    await createIndexIfMissing(
      'idx_reservations_order_level',
      `CREATE UNIQUE INDEX idx_reservations_order_level
       ON work_order_stock_reservations (work_order_id, item_id)
       WHERE conduce_id IS NULL`
    );
    await createIndexIfMissing(
      'idx_reservations_conduce_level',
      `CREATE UNIQUE INDEX idx_reservations_conduce_level
       ON work_order_stock_reservations (conduce_id, item_id)
       WHERE conduce_id IS NOT NULL`
    );
    await createIndexIfMissing(
      'idx_reservations_work_order',
      `CREATE INDEX idx_reservations_work_order
       ON work_order_stock_reservations (work_order_id, status)`
    );
  }
};
