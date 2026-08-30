const { getQuery, runQuery } = require('../../connection.cjs');

/**
 * Almacenes, unidades de medida y existencias POR ALMACEN.
 *
 * Gemela de `019_warehouses_and_stock.sql` en Postgres, con UNA diferencia de
 * fondo que viene del grano de cada app:
 *
 *   - Cloud CALCULA el total con SQL (`TOTAL_QUANTITY_SQL` de `availability.ts`)
 *     y ahi la suma de `item_stock` sustituye a `items.total_quantity`.
 *   - ESR Pro GUARDA los numeros: `available_quantity` se mantiene a base de
 *     `UPDATE ... SET available_quantity = available_quantity - ?` cuando se
 *     reserva. Aqui `items.total_quantity` SIGUE SIENDO el total, y lo que hace
 *     `item_stock` es decir DONDE esta repartido. Quien mueva existencias
 *     actualiza las dos cosas en la misma transaccion.
 *
 * Seguir el grano de cada app es lo que deja el radio de este cambio en casi
 * nada: ni una pantalla de Desktop tiene que aprender a sumar almacenes para
 * seguir dando el mismo numero que daba ayer.
 *
 * El almacen INFORMA, NO RESERVA: cotizar, aprobar, convertir y entregar
 * siguen trabajando contra el total de la empresa.
 */
module.exports = {
  version: '0009',
  name: 'warehouses_and_stock',
  async up({ addColumnIfMissing, createIndexIfMissing }) {
    // ── Almacenes ─────────────────────────────────────────────────────────
    await runQuery(`
      CREATE TABLE IF NOT EXISTS warehouses (
        id       INTEGER PRIMARY KEY AUTOINCREMENT,
        name     TEXT NOT NULL,
        code     TEXT,
        address  TEXT,
        notes    TEXT,
        -- Tres estados como el resto de catalogos: 1 activo, 2 inactivo, 0 archivado.
        is_active INTEGER DEFAULT 1
      )
    `);

    // ── Unidades de medida ────────────────────────────────────────────────
    await runQuery(`
      CREATE TABLE IF NOT EXISTS units_of_measure (
        id       INTEGER PRIMARY KEY AUTOINCREMENT,
        name     TEXT NOT NULL,
        -- La abreviatura es lo que se pinta junto a la cantidad: «120 ud».
        abbr     TEXT,
        is_active INTEGER DEFAULT 1
      )
    `);

    // ── Existencias por almacen ───────────────────────────────────────────
    //
    // Solo para los articulos DE CANTIDAD. En un serializado las existencias
    // son sus unidades registradas, y lo que se reparte es cada serial.
    await runQuery(`
      CREATE TABLE IF NOT EXISTS item_stock (
        item_id      INTEGER NOT NULL,
        warehouse_id INTEGER NOT NULL,
        quantity     INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (item_id, warehouse_id),
        FOREIGN KEY (item_id)      REFERENCES items(id),
        FOREIGN KEY (warehouse_id) REFERENCES warehouses(id)
      )
    `);
    await createIndexIfMissing(
      'idx_item_stock_item',
      'CREATE INDEX idx_item_stock_item ON item_stock (item_id)'
    );

    // ── Movimientos ───────────────────────────────────────────────────────
    //
    // En SQLite la tabla NO EXISTIA: en Postgres se creo con el modelo
    // multiempresa y aqui nunca llego. No es añadir una columna, es crear el
    // registro entero. `user_id` es el responsable.
    await runQuery(`
      CREATE TABLE IF NOT EXISTS stock_movements (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        item_id      INTEGER NOT NULL,
        warehouse_id INTEGER,
        work_order_id INTEGER,
        user_id      INTEGER,
        type         TEXT NOT NULL,
        quantity     INTEGER NOT NULL,
        reference    TEXT,
        notes        TEXT,
        created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (item_id)      REFERENCES items(id),
        FOREIGN KEY (warehouse_id) REFERENCES warehouses(id)
      )
    `);
    // La pantalla de movimientos filtra por articulo y por fecha.
    await createIndexIfMissing(
      'idx_stock_movements_item',
      'CREATE INDEX idx_stock_movements_item ON stock_movements (item_id, created_at DESC)'
    );

    // ── Columnas nuevas ───────────────────────────────────────────────────
    //
    // `suppliers` ya existe y ya tiene su CRUD: aqui solo se enlaza.
    await addColumnIfMissing('items', 'supplier_id', 'INTEGER');
    await addColumnIfMissing('items', 'uom_id', 'INTEGER');
    // El minimo es UNO POR ARTICULO y se compara contra el total: responde
    // «hay que comprar mas», que es una decision de compra y no de almacen.
    await addColumnIfMissing('items', 'min_stock', 'INTEGER DEFAULT 0');
    await addColumnIfMissing('item_serials', 'warehouse_id', 'INTEGER');

    // ── Volcado ───────────────────────────────────────────────────────────
    //
    // NEUTRO por construccion: con un solo almacen, la suma de `item_stock` es
    // exactamente el numero que ya habia, y `items.total_quantity` ni se toca.
    const almacenes = await getQuery("SELECT id FROM warehouses WHERE code = 'PRIN'");
    let principal = almacenes[0]?.id;
    if (!principal) {
      principal = (await runQuery(
        "INSERT INTO warehouses (name, code, is_active) VALUES ('Principal', 'PRIN', 1)"
      )).id;
    }

    await runQuery(
      `INSERT OR IGNORE INTO item_stock (item_id, warehouse_id, quantity)
       SELECT id, ?, COALESCE(total_quantity, 0)
         FROM items
        WHERE COALESCE(item_type, 'cantidad') <> 'serializado'`,
      [principal]
    );

    await runQuery('UPDATE item_serials SET warehouse_id = ? WHERE warehouse_id IS NULL', [
      principal
    ]);

    // ── Unidades sembradas ────────────────────────────────────────────────
    //
    // Las de uso corriente en alquiler de eventos. Se editan y se archivan
    // desde Configuracion como cualquier otro catalogo.
    const UNIDADES = [
      ['Unidad', 'ud'],
      ['Juego', 'jgo'],
      ['Par', 'par'],
      ['Caja', 'cja'],
      ['Metro', 'm'],
      ['Metro cuadrado', 'm²'],
      ['Rollo', 'rll'],
      ['Hora', 'h'],
      ['Día', 'día']
    ];
    for (const [name, abbr] of UNIDADES) {
      const existe = await getQuery('SELECT id FROM units_of_measure WHERE name = ?', [name]);
      if (!existe.length) {
        await runQuery('INSERT INTO units_of_measure (name, abbr, is_active) VALUES (?, ?, 1)', [
          name,
          abbr
        ]);
      }
    }

    // Todo articulo nace en «Unidad» mientras nadie diga otra cosa.
    const unidad = await getQuery("SELECT id FROM units_of_measure WHERE name = 'Unidad'");
    if (unidad[0]) {
      await runQuery('UPDATE items SET uom_id = ? WHERE uom_id IS NULL', [unidad[0].id]);
    }
  }
};
