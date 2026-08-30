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
  withTransaction: sqlite.withTransaction,
  createLocalSqliteBackup: sqlite.createLocalSqliteBackup,
  repositories: {
    categories: new sqlite.SqliteCategoryRepository(),
    customers: new sqlite.SqliteCustomerRepository(),
    conduces: new sqlite.SqliteConduceRepository(),
    events: new sqlite.SqliteEventRepository(),
    checklists: new sqlite.SqliteChecklistRepository(),
    companySettings: new sqlite.SqliteCompanySettingsRepository(),
    incidents: new sqlite.SqliteIncidentRepository(),
    inventory: sqlite.sqliteInventoryRepository,
    invoices: new sqlite.SqliteInvoiceRepository(),
    payments: new sqlite.SqlitePaymentRepository(),
    packages: new sqlite.SqlitePackageRepository(),
    quotes: new sqlite.SqliteQuoteRepository(),
    rentals: new sqlite.SqliteRentalRepository(),
    serials: new sqlite.SqliteSerialRepository(),
    subcategories: new sqlite.SqliteSubcategoryRepository(),
    users: new sqlite.SqliteUserRepository()
  }
};
