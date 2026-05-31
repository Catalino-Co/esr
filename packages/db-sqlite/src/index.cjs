const {
  connectSqliteDatabase,
  closeSqliteDatabase,
  getDatabase,
  getDatabasePath,
  getQuery,
  getSingleQuery,
  runQuery
} = require('./connection.cjs');
const { initDatabase } = require('./migrations/initial-schema.cjs');
const { seedDB } = require('./migrations/seed.cjs');
const { createLocalSqliteBackup } = require('./backup/local-backup.cjs');
const { SqliteCustomerRepository } = require('./repositories/sqlite-customer.repository.cjs');
const { SqliteEventRepository } = require('./repositories/sqlite-event.repository.cjs');
const {
  SqliteInventoryRepository,
  sqliteInventoryRepository
} = require('./repositories/sqlite-inventory.repository.cjs');
const { SqliteQuoteRepository } = require('./repositories/sqlite-quote.repository.cjs');
const { SqliteRentalRepository } = require('./repositories/sqlite-rental.repository.cjs');

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
  SqliteCustomerRepository,
  SqliteEventRepository,
  SqliteInventoryRepository,
  SqliteQuoteRepository,
  SqliteRentalRepository,
  sqliteInventoryRepository
};
