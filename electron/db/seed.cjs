const { runQuery, getQuery } = require('./index.cjs');

async function seedDB() {
  try {
    // Revisa si ya hay usuarios para no duplicar 'admin'
    const userCount = await getQuery("SELECT COUNT(*) as count FROM users");
    if (userCount[0].count === 0) {
      console.log("Creando usuario administrador por defecto...");
      await runQuery("INSERT INTO users (username, password, name, role) VALUES (?, ?, ?, ?)", ['admin', 'admin123', 'Administrador Principal', 'admin']);
    }

    // Check if we already have clients to avoid re-seeding
    const { count } = (await getQuery("SELECT COUNT(*) as count FROM categories"))[0];
    if (count > 0) {
      console.log("Database already seeded. Skipping initial seed.");
      return;
    }

    console.log("Seeding initial data...");

    // Seed Categories
    const catQuery = "INSERT INTO categories (name) VALUES (?)";
    await runQuery(catQuery, ['Audio']);
    await runQuery(catQuery, ['Iluminación']);
    await runQuery(catQuery, ['Mobiliario']);

    // Seed Subcategories
    const subQuery = "INSERT INTO subcategories (category_id, name) VALUES (?, ?)";
    await runQuery(subQuery, [1, 'Bocinas Activas']);
    await runQuery(subQuery, [1, 'Micrófonos']);
    await runQuery(subQuery, [2, 'Luces LED']);
    await runQuery(subQuery, [3, 'Sillas']);
    await runQuery(subQuery, [3, 'Mesas']);

    // Seed Items
    // 1: Cantidad
    await runQuery(`INSERT INTO items (internal_code, name, category_id, subcategory_id, description, item_type, uses_serial, total_quantity, available_quantity, rental_price, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, 
      ['MOB-SIL-001', 'Silla Tiffany Blanca', 3, 4, 'Silla tiffany para eventos y bodas', 'cantidad', 0, 100, 100, 50.0, 'disponible']);

    await runQuery(`INSERT INTO items (internal_code, name, category_id, subcategory_id, description, item_type, uses_serial, total_quantity, available_quantity, rental_price, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, 
      ['MOB-MES-001', 'Mesa Redonda 60"', 3, 5, 'Mesa plegable round', 'cantidad', 0, 20, 20, 150.0, 'disponible']);
      
    // 2: Serializados
    await runQuery(`INSERT INTO items (internal_code, name, category_id, subcategory_id, description, item_type, uses_serial, total_quantity, available_quantity, rental_price, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, 
      ['AUD-BOC-001', 'Bocina Activa QSC K12.2', 1, 1, 'Bocina autoamplificada 2000W', 'serializado', 1, 4, 4, 1500.0, 'disponible']);
    
    // Serials for the QSC
    await runQuery(`INSERT INTO item_serials (item_id, serial_number) VALUES (3, 'QSC-K12-001')`);
    await runQuery(`INSERT INTO item_serials (item_id, serial_number) VALUES (3, 'QSC-K12-002')`);
    await runQuery(`INSERT INTO item_serials (item_id, serial_number) VALUES (3, 'QSC-K12-003')`);
    await runQuery(`INSERT INTO item_serials (item_id, serial_number) VALUES (3, 'QSC-K12-004')`);

    // Seed Clients
    await runQuery(`INSERT INTO clients (name, document_id, phone, email, address, contact_person) 
      VALUES (?, ?, ?, ?, ?, ?)`, 
      ['Empresa Eventos S.R.L', '130123456', '809-555-1234', 'contacto@eventos.com', 'Av. Central 123', 'Juan Perez']);
      
    await runQuery(`INSERT INTO clients (name, document_id, phone, email, address, contact_person) 
      VALUES (?, ?, ?, ?, ?, ?)`, 
      ['Maria Bodas Planners', '40212345678', '829-555-9876', 'maria@bodas.com', 'Calle Real 45', 'Maria Gomez']);

    // Seed Packages
    await runQuery(`INSERT INTO packages (name, description, suggested_price) VALUES (?, ?, ?)`,
      ['Paquete Sonido Básico', 'Ideal para 50 personas, 2 bocinas y 1 micro', 3500.0]);
    
    await runQuery(`INSERT INTO package_items (package_id, item_id, quantity) VALUES (1, 3, 2)`); // 2 Bocinas QSC
    // Assuming another item will exist for mics, left out for brevity.

    console.log("Seeding complete.");
  } catch(e) {
    console.error("Error during initial seeding:", e);
  }
}

module.exports = { seedDB };
