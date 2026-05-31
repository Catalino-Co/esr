const fs = require('fs/promises');
const path = require('path');
const { getDatabasePath } = require('../connection.cjs');

async function createLocalSqliteBackup(targetDirectory) {
  const source = getDatabasePath();
  if (!source) throw new Error('SQLite database has not been connected.');
  if (!targetDirectory) throw new Error('Backup target directory is required.');

  await fs.mkdir(targetDirectory, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `esr-pro-backup-${timestamp}.sqlite`;
  const target = path.join(targetDirectory, filename);

  await fs.copyFile(source, target);

  return { path: target, filename };
}

module.exports = { createLocalSqliteBackup };
