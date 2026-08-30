const {
  connectSqliteDatabase,
  closeSqliteDatabase,
  getDatabase,
  getDatabasePath,
  getQuery,
  getSingleQuery,
  runQuery,
  withTransaction
} = require('./connection.cjs');
const { initDatabase } = require('./migrations/runner.cjs');
const { seedDB } = require('./migrations/seed.cjs');
const { createLocalSqliteBackup } = require('./backup/local-backup.cjs');
const { SqliteEventRepository } = require('./repositories/sqlite-event.repository.cjs');
const { SqliteConduceRepository } = require('./repositories/sqlite-conduce.repository.cjs');
const { SqliteIncidentRepository } = require('./repositories/sqlite-incident.repository.cjs');
const { SqliteInvoiceRepository } = require('./repositories/sqlite-invoice.repository.cjs');
const { SqlitePaymentRepository } = require('./repositories/sqlite-payment.repository.cjs');
const {
  SqliteInventoryRepository,
  sqliteInventoryRepository
} = require('./repositories/sqlite-inventory.repository.cjs');
const { SqliteQuoteRepository } = require('./repositories/sqlite-quote.repository.cjs');
const { SqliteRentalRepository } = require('./repositories/sqlite-rental.repository.cjs');
const { SqliteChecklistRepository } = require('./repositories/sqlite-checklist.repository.cjs');
const { SqliteCompanySettingsRepository } = require('./repositories/sqlite-company-settings.repository.cjs');
const { SqliteSerialRepository } = require('./repositories/sqlite-serial.repository.cjs');
const { SqliteUserRepository } = require('./repositories/sqlite-user.repository.cjs');
const { SqlitePackageRepository } = require('./repositories/sqlite-package.repository.cjs');
const {
  SqliteCategoryRepository,
  SqliteSubcategoryRepository
} = require('./repositories/sqlite-category.repository.cjs');

module.exports = {
  connectSqliteDatabase,
  closeSqliteDatabase,
  createLocalSqliteBackup,
  getDatabase,
  getDatabasePath,
  getQuery,
  getSingleQuery,
  initDatabase,
  runQuery,
  seedDB,
  withTransaction,
  SqliteCategoryRepository,
  SqliteConduceRepository,
  SqliteEventRepository,
  SqliteChecklistRepository,
  SqliteCompanySettingsRepository,
  SqliteIncidentRepository,
  SqliteInventoryRepository,
  SqliteInvoiceRepository,
  SqlitePackageRepository,
  SqlitePaymentRepository,
  SqliteQuoteRepository,
  SqliteRentalRepository,
  SqliteSerialRepository,
  SqliteSubcategoryRepository,
  SqliteUserRepository,
  sqliteInventoryRepository
};
