/**
 * Modulo de Servicios: cosas vendibles que no son un articulo de inventario
 * (una Maestria de Ceremonias, vestirse de Santa...). Gemela de
 * `036_services.sql` en Postgres, sin `company_id` (ESR Pro es single-tenant).
 *
 * No participa de Entrega/Devolucion/Cierre de orden ni genera movimiento de
 * inventario -no es tangible-, asi que no necesita almacen, unidad de medida
 * ni seriales. `service_id` se agrega como columna hermana de `item_id` en
 * las lineas de Cotizacion/Orden/Factura, nunca las dos a la vez.
 */
module.exports = {
  version: '0024',
  name: 'services',
  async up({ runQuery, addColumnIfMissing, createIndexIfMissing }) {
    await runQuery(`
      CREATE TABLE IF NOT EXISTS services (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        price REAL NOT NULL DEFAULT 0,
        notes TEXT,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT
      )
    `);
    await createIndexIfMissing(
      'services_name_unique',
      "CREATE UNIQUE INDEX services_name_unique ON services (LOWER(TRIM(name)))"
    );
    await createIndexIfMissing(
      'services_state_idx',
      'CREATE INDEX services_state_idx ON services (is_active)'
    );

    await addColumnIfMissing('quotation_items', 'service_id', 'INTEGER REFERENCES services(id)');
    await addColumnIfMissing('work_order_items', 'service_id', 'INTEGER REFERENCES services(id)');
    await addColumnIfMissing('invoice_items', 'service_id', 'INTEGER REFERENCES services(id)');

    // Facturacion de Servicios: mismo mecanismo que `invoice_conduces` (una
    // entrega fisica facturada), porque un Servicio nunca genera un conduce.
    // El indice parcial deja que anular la factura libere el servicio.
    await runQuery(`
      CREATE TABLE IF NOT EXISTS invoice_work_order_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        invoice_id INTEGER NOT NULL REFERENCES invoices(id),
        work_order_item_id INTEGER NOT NULL REFERENCES work_order_items(id),
        is_active INTEGER NOT NULL DEFAULT 1
      )
    `);
    await createIndexIfMissing(
      'invoice_wo_items_active_unique',
      'CREATE UNIQUE INDEX invoice_wo_items_active_unique ON invoice_work_order_items (work_order_item_id) WHERE is_active = 1'
    );
    await createIndexIfMissing(
      'invoice_wo_items_invoice_idx',
      'CREATE INDEX invoice_wo_items_invoice_idx ON invoice_work_order_items (invoice_id)'
    );
  }
};
