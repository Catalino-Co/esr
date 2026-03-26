const { runQuery, getQuery } = require('./index.cjs');

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getOrCreateCategory(name, color) {
  const rows = await getQuery("SELECT id FROM categories WHERE name = ?", [name]);
  if (rows.length > 0) return rows[0].id;
  const res = await runQuery(
    "INSERT INTO categories (name, color, is_active) VALUES (?, ?, 1)",
    [name, color]
  );
  return res.id;
}

async function getOrCreateSubcategory(catId, name) {
  const rows = await getQuery(
    "SELECT id FROM subcategories WHERE name = ? AND category_id = ?",
    [name, catId]
  );
  if (rows.length > 0) return rows[0].id;
  const res = await runQuery(
    "INSERT INTO subcategories (category_id, name, is_active) VALUES (?, ?, 1)",
    [catId, name]
  );
  return res.id;
}

async function insertItem(code, name, catId, subId, desc, type, qty, price, cost, loc) {
  await runQuery(
    `INSERT INTO items
       (internal_code, name, category_id, subcategory_id, description,
        item_type, uses_serial, total_quantity, available_quantity,
        rental_price, internal_cost, status, location)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'disponible', ?)`,
    [code, name, catId, subId, desc, type,
     type === 'serializado' ? 1 : 0,
     qty, qty, price, cost, loc]
  );
}

// ─── Seed inicial (usuario + categorías base) ─────────────────────────────────

async function seedDB() {
  try {
    // Usuario admin por defecto
    const userCount = await getQuery("SELECT COUNT(*) as count FROM users");
    if (userCount[0].count === 0) {
      console.log("Creando usuario administrador por defecto...");
      await runQuery(
        "INSERT INTO users (username, password, name, role) VALUES (?, ?, ?, ?)",
        ['admin', 'admin123', 'Administrador Principal', 'admin']
      );
    }

    // Seed base: categorías, subcategorías, clientes, paquete demo
    const { count } = (await getQuery("SELECT COUNT(*) as count FROM categories"))[0];
    if (count === 0) {
      console.log("Seeding initial data...");

      const catQuery = "INSERT INTO categories (name) VALUES (?)";
      await runQuery(catQuery, ['Audio']);
      await runQuery(catQuery, ['Iluminación']);
      await runQuery(catQuery, ['Mobiliario']);

      const subQuery = "INSERT INTO subcategories (category_id, name) VALUES (?, ?)";
      await runQuery(subQuery, [1, 'Bocinas Activas']);
      await runQuery(subQuery, [1, 'Micrófonos']);
      await runQuery(subQuery, [2, 'Luces LED']);
      await runQuery(subQuery, [3, 'Sillas']);
      await runQuery(subQuery, [3, 'Mesas']);

      await runQuery(
        `INSERT INTO items (internal_code, name, category_id, subcategory_id, description, item_type, uses_serial, total_quantity, available_quantity, rental_price, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ['MOB-SIL-001', 'Silla Tiffany Blanca', 3, 4, 'Silla tiffany para eventos y bodas', 'cantidad', 0, 100, 100, 50.0, 'disponible']
      );
      await runQuery(
        `INSERT INTO items (internal_code, name, category_id, subcategory_id, description, item_type, uses_serial, total_quantity, available_quantity, rental_price, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ['MOB-MES-001', 'Mesa Redonda 60"', 3, 5, 'Mesa plegable round', 'cantidad', 0, 20, 20, 150.0, 'disponible']
      );
      await runQuery(
        `INSERT INTO items (internal_code, name, category_id, subcategory_id, description, item_type, uses_serial, total_quantity, available_quantity, rental_price, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ['AUD-BOC-001', 'Bocina Activa QSC K12.2', 1, 1, 'Bocina autoamplificada 2000W', 'serializado', 1, 4, 4, 1500.0, 'disponible']
      );
      await runQuery(`INSERT INTO item_serials (item_id, serial_number) VALUES (3, 'QSC-K12-001')`);
      await runQuery(`INSERT INTO item_serials (item_id, serial_number) VALUES (3, 'QSC-K12-002')`);
      await runQuery(`INSERT INTO item_serials (item_id, serial_number) VALUES (3, 'QSC-K12-003')`);
      await runQuery(`INSERT INTO item_serials (item_id, serial_number) VALUES (3, 'QSC-K12-004')`);

      await runQuery(
        `INSERT INTO clients (name, document_id, phone, email, address, contact_person) VALUES (?, ?, ?, ?, ?, ?)`,
        ['Empresa Eventos S.R.L', '130123456', '809-555-1234', 'contacto@eventos.com', 'Av. Central 123', 'Juan Perez']
      );
      await runQuery(
        `INSERT INTO clients (name, document_id, phone, email, address, contact_person) VALUES (?, ?, ?, ?, ?, ?)`,
        ['Maria Bodas Planners', '40212345678', '829-555-9876', 'maria@bodas.com', 'Calle Real 45', 'Maria Gomez']
      );

      await runQuery(
        `INSERT INTO packages (name, description, suggested_price) VALUES (?, ?, ?)`,
        ['Paquete Sonido Básico', 'Ideal para 50 personas, 2 bocinas y 1 micro', 3500.0]
      );
      await runQuery(`INSERT INTO package_items (package_id, item_id, quantity) VALUES (1, 3, 2)`);

      console.log("Seeding inicial completo.");
    } else {
      console.log("Database already seeded. Skipping initial seed.");
    }

    // Siempre intentar seed de items de audio/video/efectos
    await seedAudioItems();

  } catch (e) {
    console.error("Error during seeding:", e);
  }
}

// ─── Seed de inventario audio/video/efectos ───────────────────────────────────

async function seedAudioItems() {
  const check = await getQuery(
    "SELECT COUNT(*) as count FROM items WHERE internal_code LIKE 'MIC-%'"
  );
  if (check[0].count > 0) {
    console.log("Audio items ya sembrados. Skipping.");
    return;
  }

  console.log("Sembrando inventario de audio, iluminación y efectos...");

  // ── Categorías ──────────────────────────────────────────────────────────────
  const catAudio    = await getOrCreateCategory('Audio',              '#3b82f6');
  const catIlum     = await getOrCreateCategory('Iluminación',        '#f59e0b');
  const catVideo    = await getOrCreateCategory('Video',              '#8b5cf6');
  const catEfectos  = await getOrCreateCategory('Efectos Especiales', '#ec4899');
  const catCableria = await getOrCreateCategory('Cablería',           '#64748b');

  // ── Subcategorías ───────────────────────────────────────────────────────────
  const subMicAlam   = await getOrCreateSubcategory(catAudio,    'Micrófonos Alámbricos');
  const subMicInal   = await getOrCreateSubcategory(catAudio,    'Micrófonos Inalámbricos');
  const subBocinas   = await getOrCreateSubcategory(catAudio,    'Bocinas y Subwoofers');
  const subConsolas  = await getOrCreateSubcategory(catAudio,    'Consolas de Mezcla');
  const subParLED    = await getOrCreateSubcategory(catIlum,     'Iluminación Estática');
  const subMoviles   = await getOrCreateSubcategory(catIlum,     'Cabezas Móviles');
  const subEfLuz     = await getOrCreateSubcategory(catIlum,     'Efectos de Luz');
  const subPantallas = await getOrCreateSubcategory(catVideo,    'Pantallas y Proyectores');
  const subMaquinas  = await getOrCreateSubcategory(catEfectos,  'Máquinas de Efectos');
  const subCabAud    = await getOrCreateSubcategory(catCableria, 'Cables de Audio');
  const subCabPow    = await getOrCreateSubcategory(catCableria, 'Cables de Poder');

  // ── MICRÓFONOS ALÁMBRICOS ───────────────────────────────────────────────────
  await insertItem('MIC-001', 'Micrófono Shure SM58',       catAudio, subMicAlam, 'Micrófono dinámico cardioide para voces',                    'serializado', 6, 15.00, 120.00, 'Almacén A');
  await insertItem('MIC-002', 'Micrófono Shure SM57',       catAudio, subMicAlam, 'Micrófono dinámico para instrumentos y amplificadores',      'serializado', 4, 12.00, 110.00, 'Almacén A');
  await insertItem('MIC-003', 'Micrófono Behringer C-1',    catAudio, subMicAlam, 'Micrófono de condensador de estudio con patrón cardioide',   'serializado', 2, 20.00,  80.00, 'Almacén A');
  await insertItem('MIC-004', 'Micrófono AKG D5',           catAudio, subMicAlam, 'Micrófono dinámico vocal supercardioide',                    'serializado', 4, 12.00,  95.00, 'Almacén A');

  // ── MICRÓFONOS INALÁMBRICOS ─────────────────────────────────────────────────
  await insertItem('INAL-001', 'Shure BLX24/SM58 Inalámbrico',              catAudio, subMicInal, 'Sistema inalámbrico UHF de mano con cápsula SM58',                    'serializado', 4, 35.00, 300.00, 'Almacén A');
  await insertItem('INAL-002', 'Sennheiser EW 100 G4 Mano',                 catAudio, subMicInal, 'Sistema inalámbrico vocal profesional banda A',                       'serializado', 2, 45.00, 450.00, 'Almacén A');
  await insertItem('INAL-003', 'Sennheiser EW 100 G4 Bodypack',             catAudio, subMicInal, 'Sistema inalámbrico con bodypack para solapa o diadema',              'serializado', 4, 45.00, 480.00, 'Almacén A');
  await insertItem('INAL-004', 'Micrófono de Diadema AKG C520',             catAudio, subMicInal, 'Headset condensador cardioide para uso en vivo',                      'cantidad',    6, 15.00,  60.00, 'Almacén A');
  await insertItem('INAL-005', 'Micrófono de Solapa Sennheiser ME 4',       catAudio, subMicInal, 'Micrófono lavalier cardioide, negro, para bodypack',                  'cantidad',    8, 10.00,  45.00, 'Almacén A');

  // ── BOCINAS Y SUBWOOFERS ────────────────────────────────────────────────────
  await insertItem('BOC-001', 'Bocina Activa JBL SRX815P 15"',  catAudio, subBocinas, 'Altavoz activo 2000W peak, 15 pulgadas, con amplificador integrado', 'serializado', 4, 85.00,  850.00, 'Almacén B');
  await insertItem('BOC-002', 'Bocina Activa RCF ART 715-A MK4',catAudio, subBocinas, 'Altavoz activo 15 pulgadas, 1400W, clase D',                         'serializado', 2, 80.00,  720.00, 'Almacén B');
  await insertItem('BOC-003', 'Bocina Activa QSC K12.2 12"',    catAudio, subBocinas, 'Altavoz activo 2000W, 12 pulgadas con DSP incorporado',              'serializado', 4, 75.00,  780.00, 'Almacén B');
  await insertItem('BOC-004', 'Subwoofer JBL SRX818SP 18"',     catAudio, subBocinas, 'Subwoofer activo 18 pulgadas, 2000W peak',                           'serializado', 4, 95.00,  950.00, 'Almacén B');
  await insertItem('BOC-005', 'Subwoofer QSC KS112 12"',         catAudio, subBocinas, 'Subwoofer compacto activo 3600W peak, autoamplificado',              'serializado', 2, 80.00,  800.00, 'Almacén B');
  await insertItem('BOC-006', 'Monitor de Escenario JBL SRX712M',catAudio, subBocinas, 'Monitor de piso 12 pulgadas, 2000W peak, para músicos',             'serializado', 6, 55.00,  550.00, 'Almacén B');

  // ── CONSOLAS DE MEZCLA ──────────────────────────────────────────────────────
  await insertItem('CON-001', 'Consola Yamaha MG16XU 16 canales', catAudio, subConsolas, 'Mezcladora analógica 16 canales con efectos SPX y USB',    'serializado', 2, 65.00, 450.00, 'Almacén A');
  await insertItem('CON-002', 'Consola Allen & Heath ZEDi-10',    catAudio, subConsolas, 'Mezcladora híbrida 10 canales con interfaz USB 32-bit',     'serializado', 1, 55.00, 320.00, 'Almacén A');

  // ── ILUMINACIÓN ESTÁTICA ────────────────────────────────────────────────────
  await insertItem('PAR-001', 'Par LED RGB 54x3W',         catIlum, subParLED, 'Foco PAR LED RGB, 54 LEDs de 3W, control DMX',                  'cantidad', 20,  8.00,  60.00, 'Almacén C');
  await insertItem('PAR-002', 'Par LED RGBW 18x12W',       catIlum, subParLED, 'Foco PAR LED RGBW profesional, 18 LEDs de 12W',                 'cantidad', 12, 15.00, 120.00, 'Almacén C');
  await insertItem('BAR-001', 'Barra LED RGBW 12 píxeles', catIlum, subParLED, 'Barra de 12 píxeles LED RGBW, controlable por DMX',             'cantidad',  8, 20.00, 180.00, 'Almacén C');

  // ── CABEZAS MÓVILES ─────────────────────────────────────────────────────────
  await insertItem('MOV-001', 'Cabeza Móvil Beam 230W Sharpy', catIlum, subMoviles, 'Moving head beam 230W, 14 colores, 13 gobos fijos',         'serializado', 4, 120.00, 1200.00, 'Almacén C');
  await insertItem('MOV-002', 'Cabeza Móvil Spot 150W LED',    catIlum, subMoviles, 'Moving head spot LED 150W, zoom variable, prisma 3/5 caras', 'serializado', 4,  90.00,  900.00, 'Almacén C');
  await insertItem('MOV-003', 'Scanner LED 30W',               catIlum, subMoviles, 'Scanner LED 30W con espejo motorizado, gobo y rueda de color','serializado', 6,  45.00,  350.00, 'Almacén C');

  // ── EFECTOS DE LUZ ──────────────────────────────────────────────────────────
  await insertItem('EFX-001', 'Luz Stroboscópica LED 150W', catIlum, subEfLuz, 'Estroboscopio LED 150W con control de frecuencia DMX',      'cantidad',    4, 25.00, 200.00, 'Almacén C');
  await insertItem('EFX-002', 'Luz UV LED 18 LEDs',          catIlum, subEfLuz, 'Foco ultravioleta 18 LEDs para efectos de neón/blacklight', 'cantidad',    6, 12.00,  80.00, 'Almacén C');
  await insertItem('EFX-003', 'Láser DJ RGB 500mW',          catIlum, subEfLuz, 'Efecto láser multicolor 500mW con patrones y control DMX',  'serializado', 2, 35.00, 280.00, 'Almacén C');

  // ── PANTALLAS Y PROYECTORES ─────────────────────────────────────────────────
  await insertItem('VID-001', 'Pantalla Samsung 80" LED 4K',      catVideo, subPantallas, 'Televisor LED 80 pulgadas 4K UHD con 4 HDMI y soporte',     'serializado', 2, 150.00, 1500.00, 'Almacén D');
  await insertItem('VID-002', 'Proyector Epson PowerLite 2250U',  catVideo, subPantallas, 'Proyector 5000 lúmenes WUXGA Full HD, HDMI y red WiFi',      'serializado', 1, 180.00, 1800.00, 'Almacén D');

  // ── MÁQUINAS DE EFECTOS ESPECIALES ─────────────────────────────────────────
  await insertItem('HUM-001', 'Máquina de Humo Antari Z-1500',      catEfectos, subMaquinas, 'Máquina de humo profesional 1500W con control remoto DMX',  'serializado', 3,  60.00, 550.00, 'Almacén D');
  await insertItem('HUM-002', 'Máquina de Niebla Elation Hazer 400W',catEfectos, subMaquinas,'Hazer de aceite 400W para niebla fina y continua',           'serializado', 2,  45.00, 420.00, 'Almacén D');
  await insertItem('HUM-003', 'Máquina de Burbujas',                  catEfectos, subMaquinas,'Generadora de burbujas decorativas para eventos sociales',   'cantidad',    2,  25.00, 180.00, 'Almacén D');
  await insertItem('HUM-004', 'Máquina de Nieve 650W',                catEfectos, subMaquinas,'Máquina de nieve artificial 650W con manguera flexible 5m',  'serializado', 1,  35.00, 280.00, 'Almacén D');

  // ── CABLES DE AUDIO ─────────────────────────────────────────────────────────
  await insertItem('CAB-001', 'Cable XLR Macho-Hembra 5m',      catCableria, subCabAud, 'Cable balanceado XLR M/H de 5 metros, trenzado Mogami',      'cantidad', 30, 3.00, 18.00, 'Almacén A');
  await insertItem('CAB-002', 'Cable XLR Macho-Hembra 10m',     catCableria, subCabAud, 'Cable balanceado XLR M/H de 10 metros, trenzado Mogami',     'cantidad', 20, 5.00, 25.00, 'Almacén A');
  await insertItem('CAB-003', 'Cable XLR Macho-Hembra 20m',     catCableria, subCabAud, 'Cable balanceado XLR M/H de 20 metros, trenzado Mogami',     'cantidad', 10, 8.00, 40.00, 'Almacén A');
  await insertItem('CAB-004', 'Cable TRS 6.35mm a XLR 3m',      catCableria, subCabAud, 'Cable de inserción TRS balanceado a XLR macho, 3 metros',    'cantidad', 15, 3.00, 15.00, 'Almacén A');
  await insertItem('CAB-005', 'Adaptador XLR a TRS 6.35mm',     catCableria, subCabAud, 'Adaptador metálico rápido XLR hembra a TRS macho 6.35mm',    'cantidad', 20, 1.00,  5.00, 'Almacén A');

  // ── CABLES DE PODER ─────────────────────────────────────────────────────────
  await insertItem('POW-001', 'Cable de Poder 3m (Nema 5-15)',       catCableria, subCabPow, 'Cable de alimentación estándar 3m, calibre 16AWG',            'cantidad', 40,   1.50,    8.00, 'Almacén A');
  await insertItem('POW-002', 'Cable de Poder 10m',                   catCableria, subCabPow, 'Cable de alimentación de 10 metros, calibre 14AWG',           'cantidad', 20,   3.00,   15.00, 'Almacén A');
  await insertItem('POW-003', 'Extensión Multicontacto 6 tomas 10m', catCableria, subCabPow, 'Extensión 6 tomas con protección de voltaje y tierra, 10m',   'cantidad', 10,   5.00,   35.00, 'Almacén A');
  await insertItem('POW-004', 'Planta Eléctrica Honda EU2200i',       catCableria, subCabPow, 'Generador portátil inverter silencioso 2200W, arranque fácil','serializado', 1, 150.00, 1200.00, 'Almacén B');

  console.log("✓ Inventario sembrado: 43 ítems en Audio, Iluminación, Video, Efectos y Cablería.");
}

module.exports = { seedDB };
