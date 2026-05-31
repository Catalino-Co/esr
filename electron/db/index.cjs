const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const { app } = require('electron');

// Get the user data directory so we can persist the DB
const dbPath = path.join(app.getPath('userData'), 'esr_app_data.sqlite');
const db = new sqlite3.Database(dbPath);

function initDB() {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      // 1. Users (Auth)
      db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        name TEXT,
        role TEXT DEFAULT 'admin',
        is_active INTEGER DEFAULT 1
      )`);

      // 2. Clients
      db.run(`CREATE TABLE IF NOT EXISTS clients (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        document_id TEXT,
        phone TEXT,
        email TEXT,
        address TEXT,
        contact_person TEXT,
        notes TEXT,
        is_active INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`);

      // 3. Events
      db.run(`CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        client_id INTEGER,
        name TEXT NOT NULL,
        event_type TEXT,
        date TEXT,
        departure_time TEXT,
        setup_time TEXT,
        pickup_time TEXT,
        location TEXT,
        responsible_person TEXT,
        notes TEXT,
        status TEXT DEFAULT 'tentativo',
        FOREIGN KEY (client_id) REFERENCES clients(id)
      )`, () => {
        // Add new columns safely if they don't exist yet
        db.run("ALTER TABLE events ADD COLUMN pickup_date TEXT", () => {});
        db.run("ALTER TABLE events ADD COLUMN quotation_id INTEGER", () => {});
        db.run("ALTER TABLE events ADD COLUMN work_order_id INTEGER", () => {});
        db.run("ALTER TABLE events ADD COLUMN is_active INTEGER DEFAULT 1", () => {});
      });

      // 3.5 Event Types
      db.run(`CREATE TABLE IF NOT EXISTS event_types (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        is_active INTEGER DEFAULT 1
      )`, () => {
        db.run("ALTER TABLE event_types ADD COLUMN color TEXT DEFAULT '#6366f1'", () => {});
        db.run("ALTER TABLE event_types ADD COLUMN description TEXT", () => {});
      });

      // 4. Categories & Subcategories
      db.run(`CREATE TABLE IF NOT EXISTS categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL
      )`, () => {
        db.run("ALTER TABLE categories ADD COLUMN is_active INTEGER DEFAULT 1", () => {});
        db.run("ALTER TABLE categories ADD COLUMN color TEXT DEFAULT '#6366f1'", () => {});
      });
      
      db.run(`CREATE TABLE IF NOT EXISTS subcategories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        category_id INTEGER,
        name TEXT NOT NULL,
        FOREIGN KEY(category_id) REFERENCES categories(id)
      )`, () => {
        db.run("ALTER TABLE subcategories ADD COLUMN is_active INTEGER DEFAULT 1", () => {});
      });

      // 4. Items (Inventory)
      db.run(`CREATE TABLE IF NOT EXISTS items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        internal_code TEXT,
        name TEXT NOT NULL,
        category_id INTEGER,
        subcategory_id INTEGER,
        description TEXT,
        item_type TEXT DEFAULT 'cantidad', -- 'cantidad' or 'serializado'
        uses_serial INTEGER DEFAULT 0,
        total_quantity INTEGER DEFAULT 0,
        available_quantity INTEGER DEFAULT 0,
        rental_price REAL DEFAULT 0.0,
        internal_cost REAL DEFAULT 0.0,
        status TEXT DEFAULT 'disponible',
        location TEXT,
        notes TEXT,
        is_active INTEGER DEFAULT 1,
        FOREIGN KEY(category_id) REFERENCES categories(id),
        FOREIGN KEY(subcategory_id) REFERENCES subcategories(id)
      )`);

      // 5. Item Serials
      db.run(`CREATE TABLE IF NOT EXISTS item_serials (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        item_id INTEGER,
        serial_number TEXT NOT NULL,
        status TEXT DEFAULT 'disponible',
        FOREIGN KEY(item_id) REFERENCES items(id)
      )`);

      // 6. Packages
      db.run(`CREATE TABLE IF NOT EXISTS packages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        description TEXT,
        suggested_price REAL DEFAULT 0.0,
        notes TEXT,
        is_active INTEGER DEFAULT 1
      )`);

      db.run(`CREATE TABLE IF NOT EXISTS package_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        package_id INTEGER,
        item_id INTEGER,
        quantity INTEGER DEFAULT 1,
        FOREIGN KEY(package_id) REFERENCES packages(id),
        FOREIGN KEY(item_id) REFERENCES items(id)
      )`);

      // 7. Quotations
      db.run(`CREATE TABLE IF NOT EXISTS quotations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        client_id INTEGER,
        event_id INTEGER,
        date TEXT,
        validity_days INTEGER DEFAULT 15,
        subtotal REAL DEFAULT 0.0,
        discount REAL DEFAULT 0.0,
        total REAL DEFAULT 0.0,
        status TEXT DEFAULT 'borrador',
        notes TEXT,
        conditions TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        is_active INTEGER DEFAULT 1,
        FOREIGN KEY(client_id) REFERENCES clients(id),
        FOREIGN KEY(event_id) REFERENCES events(id)
      )`);

      db.run(`CREATE TABLE IF NOT EXISTS quotation_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        quotation_id INTEGER,
        item_id INTEGER,
        package_id INTEGER,
        quantity INTEGER DEFAULT 1,
        price REAL DEFAULT 0.0,
        FOREIGN KEY(quotation_id) REFERENCES quotations(id),
        FOREIGN KEY(item_id) REFERENCES items(id),
        FOREIGN KEY(package_id) REFERENCES packages(id)
      )`);

      // 8. Work Orders
      db.run(`CREATE TABLE IF NOT EXISTS work_orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        client_id INTEGER,
        event_id INTEGER,
        quotation_id INTEGER,
        date TEXT,
        responsible_person TEXT,
        assigned_collaborator_id INTEGER,
        assigned_supplier_id INTEGER,
        vehicle TEXT,
        notes TEXT,
        status TEXT DEFAULT 'pendiente',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        is_active INTEGER DEFAULT 1,
        FOREIGN KEY(client_id) REFERENCES clients(id),
        FOREIGN KEY(event_id) REFERENCES events(id),
        FOREIGN KEY(quotation_id) REFERENCES quotations(id)
      )`);

      db.run(`CREATE TABLE IF NOT EXISTS work_order_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        work_order_id INTEGER,
        item_id INTEGER,
        quantity INTEGER DEFAULT 1,
        FOREIGN KEY(work_order_id) REFERENCES work_orders(id),
        FOREIGN KEY(item_id) REFERENCES items(id)
      )`);

      db.run(`CREATE TABLE IF NOT EXISTS work_order_stock_reservations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        work_order_id INTEGER NOT NULL,
        item_id INTEGER NOT NULL,
        quantity INTEGER NOT NULL DEFAULT 1,
        status TEXT DEFAULT 'reserved',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(work_order_id, item_id),
        FOREIGN KEY(work_order_id) REFERENCES work_orders(id),
        FOREIGN KEY(item_id) REFERENCES items(id)
      )`);

      // 9. Conduces (Delivery Notes / Invoices)
      db.run(`CREATE TABLE IF NOT EXISTS conduces (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        work_order_id INTEGER,
        client_id INTEGER,
        date TEXT,
        status TEXT DEFAULT 'emitido',
        driver_or_vehicle TEXT,
        notes TEXT,
        subtotal REAL DEFAULT 0.0,
        discount REAL DEFAULT 0.0,
        total REAL DEFAULT 0.0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        is_active INTEGER DEFAULT 1,
        FOREIGN KEY(work_order_id) REFERENCES work_orders(id),
        FOREIGN KEY(client_id) REFERENCES clients(id)
      )`, () => {
        db.run("ALTER TABLE conduces ADD COLUMN subtotal REAL DEFAULT 0.0", () => {});
        db.run("ALTER TABLE conduces ADD COLUMN discount REAL DEFAULT 0.0", () => {});
        db.run("ALTER TABLE conduces ADD COLUMN total REAL DEFAULT 0.0", () => {});
      });

      db.run(`CREATE TABLE IF NOT EXISTS conduce_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        conduce_id INTEGER,
        item_id INTEGER,
        quantity INTEGER DEFAULT 1,
        price REAL DEFAULT 0.0,
        FOREIGN KEY(conduce_id) REFERENCES conduces(id),
        FOREIGN KEY(item_id) REFERENCES items(id)
      )`, () => {
        db.run("ALTER TABLE conduce_items ADD COLUMN price REAL DEFAULT 0.0", () => {});
      });

      // 10. Checklist
      db.run(`CREATE TABLE IF NOT EXISTS work_order_checklists (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        work_order_id INTEGER,
        item_id INTEGER,
        type TEXT, -- 'salida' or 'retorno'
        expected_quantity INTEGER DEFAULT 0,
        actual_quantity INTEGER DEFAULT 0,
        is_damaged INTEGER DEFAULT 0,
        is_missing INTEGER DEFAULT 0,
        notes TEXT,
        FOREIGN KEY(work_order_id) REFERENCES work_orders(id),
        FOREIGN KEY(item_id) REFERENCES items(id)
      )`);

      // 10. Incidents
      db.run(`CREATE TABLE IF NOT EXISTS incidents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT, -- 'daño', 'pérdida', 'faltante', 'avería'
        item_id INTEGER,
        client_id INTEGER,
        event_id INTEGER,
        work_order_id INTEGER,
        date TEXT,
        description TEXT,
        severity TEXT,
        estimated_cost REAL,
        status TEXT DEFAULT 'reportado',
        notes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(item_id) REFERENCES items(id),
        FOREIGN KEY(client_id) REFERENCES clients(id),
        FOREIGN KEY(work_order_id) REFERENCES work_orders(id)
      )`, () => {
        db.run("ALTER TABLE incidents ADD COLUMN is_active INTEGER DEFAULT 1", () => {});
      });

      // 11. Collaborators
      db.run(`CREATE TABLE IF NOT EXISTS collaborators (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        phone TEXT,
        email TEXT,
        role TEXT,
        notes TEXT,
        is_active INTEGER DEFAULT 1
      )`);

      // 12. Suppliers
      db.run(`CREATE TABLE IF NOT EXISTS suppliers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        contact TEXT,
        phone TEXT,
        email TEXT,
        service TEXT,
        notes TEXT,
        is_active INTEGER DEFAULT 1
      )`);

      // 13. Company Info
      db.run(`CREATE TABLE IF NOT EXISTS company_info (
        id INTEGER PRIMARY KEY CHECK (id = 1), -- Only one row
        name TEXT NOT NULL DEFAULT 'Tu Empresa',
        rnc TEXT,
        phone TEXT,
        email TEXT,
        address TEXT,
        logo_base64 TEXT
      )`, (err) => {
        if (err) {
          reject(err);
          return;
        }

        // Insert default row if not exists
        db.run(`INSERT OR IGNORE INTO company_info (id, name) VALUES (1, 'Tu Empresa')`, (insertErr) => {
          if (insertErr) reject(insertErr);
          else resolve();
        });
      });

    });
  });
}

// Promisified query helper
function runQuery(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      resolve({ id: this.lastID, changes: this.changes });
    });
  });
}

function getQuery(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      resolve(rows);
    });
  });
}

function getSingleQuery(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      resolve(row);
    });
  });
}

module.exports = {
  db,
  initDB,
  runQuery,
  getQuery,
  getSingleQuery
};
