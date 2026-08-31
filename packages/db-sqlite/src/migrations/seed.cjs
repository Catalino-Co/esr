const { getQuery, runQuery } = require('../connection.cjs');

async function ensureCategory(name, color) {
  const rows = await getQuery('SELECT id FROM categories WHERE name = ?', [name]);
  if (rows.length > 0) return rows[0].id;

  const result = await runQuery('INSERT INTO categories (name, color) VALUES (?, ?)', [name, color]);
  return result.id;
}

async function ensureSubcategory(categoryId, name) {
  const rows = await getQuery('SELECT id FROM subcategories WHERE category_id = ? AND name = ?', [categoryId, name]);
  if (rows.length > 0) return rows[0].id;

  const result = await runQuery('INSERT INTO subcategories (category_id, name) VALUES (?, ?)', [categoryId, name]);
  return result.id;
}

async function ensureItem(item) {
  const rows = await getQuery('SELECT id FROM items WHERE internal_code = ?', [item.internal_code]);
  if (rows.length > 0) return rows[0].id;

  const result = await runQuery(
    // Ni `status` ni `location`: se fueron a `item_inventory` en la 0010 y la
    // 0011 las borro. `total_quantity` y `available_quantity` se quedan porque
    // en ESR Pro son el motor de reservas, no un espejo del stock.
    `INSERT INTO items (
      internal_code, name, category_id, subcategory_id, description,
      item_type, uses_serial, total_quantity, available_quantity,
      rental_price, internal_cost)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      item.internal_code,
      item.name,
      item.category_id,
      item.subcategory_id,
      item.description || '',
      item.item_type || 'cantidad',
      item.uses_serial || 0,
      item.total_quantity || 0,
      item.available_quantity ?? item.total_quantity ?? 0,
      item.rental_price || 0,
      item.internal_cost || 0
    ]
  );

  // La siembra corre DESPUES de migrar, asi que el volcado de la 0009 —que
  // reparte `total_quantity` en `item_stock`— ya paso de largo cuando estos
  // articulos nacen. Sin estas dos filas, una instalacion nueva enseñaria cada
  // articulo con 8 en «Total» y 0 «En almacen», que es justo la contradiccion
  // que la fase de almacenes vino a quitar.
  const almacen = await getQuery(
    "SELECT id FROM warehouses WHERE is_active = 1 ORDER BY CASE WHEN code = 'PRIN' THEN 0 ELSE 1 END, id LIMIT 1"
  );
  if (almacen[0] && (item.item_type || 'cantidad') !== 'serializado') {
    await runQuery(
      `INSERT OR IGNORE INTO item_stock (item_id, warehouse_id, quantity) VALUES (?, ?, ?)`,
      [result.id, almacen[0].id, item.total_quantity || 0]
    );
  }
  await runQuery(
    `INSERT OR IGNORE INTO item_inventory (item_id, min_stock, physical_status)
     VALUES (?, 0, 'disponible')`,
    [result.id]
  );

  return result.id;
}

async function seedDB() {
  try {
    const existingCategories = await getQuery('SELECT COUNT(*) as count FROM categories');
    if ((existingCategories[0]?.count || 0) > 0) return;

    const audioId = await ensureCategory('Audio', '#3b82f6');
    const lightingId = await ensureCategory('Iluminación', '#f59e0b');
    const furnitureId = await ensureCategory('Mobiliario', '#10b981');

    const speakersId = await ensureSubcategory(audioId, 'Bocinas Activas');
    const microphonesId = await ensureSubcategory(audioId, 'Micrófonos');
    const ledId = await ensureSubcategory(lightingId, 'Luces LED');
    const chairsId = await ensureSubcategory(furnitureId, 'Sillas');
    const tablesId = await ensureSubcategory(furnitureId, 'Mesas');

    const qscId = await ensureItem({
      internal_code: 'AUD-001',
      name: 'Bocina QSC K12.2',
      category_id: audioId,
      subcategory_id: speakersId,
      description: 'Bocina activa 12 pulgadas',
      item_type: 'serializado',
      uses_serial: 1,
      total_quantity: 4,
      available_quantity: 4,
      rental_price: 2500
    });

    await ensureItem({
      internal_code: 'AUD-002',
      name: 'Micrófono Shure SM58',
      category_id: audioId,
      subcategory_id: microphonesId,
      description: 'Micrófono vocal dinámico',
      item_type: 'cantidad',
      uses_serial: 0,
      total_quantity: 8,
      available_quantity: 8,
      rental_price: 350
    });

    await ensureItem({
      internal_code: 'ILU-001',
      name: 'Par LED RGBW',
      category_id: lightingId,
      subcategory_id: ledId,
      description: 'Luz LED RGBW para ambientación',
      item_type: 'cantidad',
      uses_serial: 0,
      total_quantity: 12,
      available_quantity: 12,
      rental_price: 450
    });

    await ensureItem({
      internal_code: 'MOB-001',
      name: 'Silla Tiffany Blanca',
      category_id: furnitureId,
      subcategory_id: chairsId,
      description: 'Silla Tiffany color blanco',
      item_type: 'cantidad',
      uses_serial: 0,
      total_quantity: 100,
      available_quantity: 100,
      rental_price: 75
    });

    await ensureItem({
      internal_code: 'MOB-002',
      name: 'Mesa Redonda 60"',
      category_id: furnitureId,
      subcategory_id: tablesId,
      description: 'Mesa redonda para 10 personas',
      item_type: 'cantidad',
      uses_serial: 0,
      total_quantity: 15,
      available_quantity: 15,
      rental_price: 400
    });

    for (let i = 1; i <= 4; i += 1) {
      await runQuery('INSERT INTO item_serials (item_id, serial_number) VALUES (?, ?)', [
        qscId,
        `QSC-K12-${String(i).padStart(3, '0')}`
      ]);
    }

    await runQuery(
      `INSERT INTO clients (name, document_id, phone, email, address, contact_person)
       VALUES (?, ?, ?, ?, ?, ?)`,
      ['Cliente Demo SRL', '130000000', '809-555-0101', 'demo@cliente.com', 'Santo Domingo', 'Ana Demo']
    );

    await runQuery(
      `INSERT INTO packages (name, description, suggested_price)
       VALUES (?, ?, ?)`,
      ['Paquete Audio Básico', '2 bocinas QSC y 2 micrófonos SM58', 5500]
    );

    await runQuery('INSERT INTO package_items (package_id, item_id, quantity) VALUES (1, ?, 2)', [qscId]);
  } catch (error) {
    console.error('Error seeding SQLite database:', error);
  }
}

module.exports = { seedDB };
