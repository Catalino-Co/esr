module.exports = {
  version: '0002',
  name: 'operational_extensions',
  async up({ addColumnIfMissing, createIndexIfMissing, runQuery }) {
    await addColumnIfMissing('events', 'pickup_date', 'TEXT');
    await addColumnIfMissing('events', 'quotation_id', 'INTEGER');
    await addColumnIfMissing('events', 'work_order_id', 'INTEGER');
    await addColumnIfMissing('events', 'is_active', 'INTEGER DEFAULT 1');

    await addColumnIfMissing('event_types', 'color', "TEXT DEFAULT '#6366f1'");
    await addColumnIfMissing('event_types', 'description', 'TEXT');

    await addColumnIfMissing('categories', 'is_active', 'INTEGER DEFAULT 1');
    await addColumnIfMissing('categories', 'color', "TEXT DEFAULT '#6366f1'");
    await addColumnIfMissing('subcategories', 'is_active', 'INTEGER DEFAULT 1');

    await addColumnIfMissing('items', 'item_type', "TEXT DEFAULT 'cantidad'");
    await addColumnIfMissing('items', 'uses_serial', 'INTEGER DEFAULT 0');
    await addColumnIfMissing('items', 'internal_cost', 'REAL DEFAULT 0.0');
    await addColumnIfMissing('items', 'location', 'TEXT');

    await addColumnIfMissing('conduces', 'subtotal', 'REAL DEFAULT 0.0');
    await addColumnIfMissing('conduces', 'discount', 'REAL DEFAULT 0.0');
    await addColumnIfMissing('conduces', 'total', 'REAL DEFAULT 0.0');
    await addColumnIfMissing('conduce_items', 'price', 'REAL DEFAULT 0.0');

    await addColumnIfMissing('incidents', 'is_active', 'INTEGER DEFAULT 1');

    await createIndexIfMissing(
      'idx_work_order_checklists_work_order_type',
      'CREATE INDEX idx_work_order_checklists_work_order_type ON work_order_checklists(work_order_id, type)'
    );
    await createIndexIfMissing(
      'idx_incidents_work_order_active',
      'CREATE INDEX idx_incidents_work_order_active ON incidents(work_order_id, is_active)'
    );
    await createIndexIfMissing(
      'idx_item_serials_item_status',
      'CREATE INDEX idx_item_serials_item_status ON item_serials(item_id, status)'
    );
    await createIndexIfMissing(
      'idx_work_order_item_serials_work_order',
      'CREATE INDEX idx_work_order_item_serials_work_order ON work_order_item_serials(work_order_id)'
    );

    await runQuery("UPDATE items SET uses_serial = 1 WHERE item_type = 'serializado'");
    await runQuery("UPDATE items SET item_type = 'serializado' WHERE uses_serial = 1");
  }
};
