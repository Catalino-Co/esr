const { getQuery, runQuery } = require('../../connection.cjs');

/**
 * Varios proveedores por artículo. Gemela de `033_item_suppliers.sql` en
 * Postgres, sin `company_id` (ESR Pro es single-tenant).
 *
 * `items.supplier_id` era UN solo proveedor; se queda sin usarse —mismo
 * criterio que con `items.description`— y esta tabla puente es la fuente
 * nueva. `is_primary` es el proveedor preferido de ESE artículo.
 */
module.exports = {
  version: '0021',
  name: 'item_suppliers',
  async up({ createIndexIfMissing }) {
    await runQuery(`
      CREATE TABLE IF NOT EXISTS item_suppliers (
        item_id     INTEGER NOT NULL,
        supplier_id INTEGER NOT NULL,
        is_primary  INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (item_id, supplier_id),
        FOREIGN KEY (item_id)     REFERENCES items(id),
        FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
      )
    `);
    await createIndexIfMissing(
      'idx_item_suppliers_item',
      'CREATE INDEX idx_item_suppliers_item ON item_suppliers (item_id)'
    );

    // Respaldo: el proveedor único que ya tuviera cada artículo, como principal.
    const conProveedor = await getQuery(
      'SELECT id, supplier_id FROM items WHERE supplier_id IS NOT NULL'
    );
    for (const fila of conProveedor) {
      await runQuery(
        'INSERT OR IGNORE INTO item_suppliers (item_id, supplier_id, is_primary) VALUES (?, ?, 1)',
        [fila.id, fila.supplier_id]
      );
    }
  }
};
