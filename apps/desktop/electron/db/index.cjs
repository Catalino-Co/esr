const path = require('path');
const { app } = require('electron');
const sqlite = require('@esr/db-sqlite');

const dbPath = path.join(app.getPath('userData'), 'esr_app_data.sqlite');
const db = sqlite.connectSqliteDatabase({ dbPath });

module.exports = {
  db,
  initDB: sqlite.initDatabase,
  runQuery: sqlite.runQuery,
  getQuery: sqlite.getQuery,
  getSingleQuery: sqlite.getSingleQuery,
  repositories: {
    customers: new sqlite.SqliteCustomerRepository(),
    events: new sqlite.SqliteEventRepository(),
    inventory: sqlite.sqliteInventoryRepository,
    quotes: new sqlite.SqliteQuoteRepository(),
    rentals: new sqlite.SqliteRentalRepository()
  }
};
