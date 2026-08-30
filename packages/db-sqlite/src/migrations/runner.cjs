const { getQuery, runQuery } = require('../connection.cjs');
const baseline = require('./versioned/0001_initial_schema.cjs');
const operationalExtensions = require('./versioned/0002_operational_extensions.cjs');
const invoicesAndPayments = require('./versioned/0003_invoices_and_payments.cjs');
const reservationsPerConduce = require('./versioned/0004_reservations_per_conduce.cjs');
const clientDirectory = require('./versioned/0005_client_directory.cjs');
const quoteTax = require('./versioned/0006_quote_tax.cjs');

const MIGRATIONS = [
  baseline,
  operationalExtensions,
  invoicesAndPayments,
  reservationsPerConduce,
  clientDirectory,
  quoteTax
];

async function initDatabase() {
  await ensureMigrationsTable();

  const appliedRows = await getQuery('SELECT version FROM schema_migrations');
  const applied = new Set(appliedRows.map((row) => row.version));

  for (const migration of MIGRATIONS) {
    if (applied.has(migration.version)) continue;
    await applyMigration(migration);
  }
}

async function ensureMigrationsTable() {
  await runQuery(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`
  );
}

async function applyMigration(migration) {
  const useTransaction = migration.transaction !== false;

  if (useTransaction) await runQuery('BEGIN IMMEDIATE TRANSACTION');

  try {
    await migration.up({
      addColumnIfMissing,
      createIndexIfMissing,
      getQuery,
      runQuery,
      tableExists,
      columnExists
    });

    await runQuery(
      'INSERT INTO schema_migrations (version, name) VALUES (?, ?)',
      [migration.version, migration.name]
    );

    if (useTransaction) await runQuery('COMMIT');
  } catch (error) {
    if (useTransaction) await rollbackQuietly();
    throw new Error(`Migration ${migration.version} ${migration.name} failed: ${error.message}`);
  }
}

async function tableExists(tableName) {
  const rows = await getQuery(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
    [tableName]
  );
  return rows.length > 0;
}

async function columnExists(tableName, columnName) {
  const rows = await getQuery(`PRAGMA table_info(${quoteIdentifier(tableName)})`);
  return rows.some((row) => row.name === columnName);
}

async function addColumnIfMissing(tableName, columnName, columnDefinition) {
  if (!(await tableExists(tableName))) return;
  if (await columnExists(tableName, columnName)) return;
  await runQuery(`ALTER TABLE ${quoteIdentifier(tableName)} ADD COLUMN ${quoteIdentifier(columnName)} ${columnDefinition}`);
}

async function createIndexIfMissing(indexName, sql) {
  const rows = await getQuery(
    "SELECT name FROM sqlite_master WHERE type = 'index' AND name = ?",
    [indexName]
  );
  if (rows.length > 0) return;
  await runQuery(sql);
}

async function rollbackQuietly() {
  try {
    await runQuery('ROLLBACK');
  } catch {
    // Ignore rollback errors so the original migration failure is preserved.
  }
}

function quoteIdentifier(value) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

module.exports = {
  MIGRATIONS,
  initDatabase
};
