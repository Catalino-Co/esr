const sqlite3 = require('sqlite3').verbose();

let db = null;
let dbPath = null;

function connectSqliteDatabase(options = {}) {
  if (!options.dbPath) {
    throw new Error('SQLite dbPath is required.');
  }

  if (db && dbPath === options.dbPath) {
    return db;
  }

  dbPath = options.dbPath;
  db = new sqlite3.Database(dbPath);
  return db;
}

function getDatabase() {
  if (!db) {
    throw new Error('SQLite database has not been connected.');
  }

  return db;
}

function getDatabasePath() {
  return dbPath;
}

function closeSqliteDatabase() {
  return new Promise((resolve, reject) => {
    if (!db) {
      resolve();
      return;
    }

    db.close((err) => {
      if (err) {
        reject(err);
        return;
      }

      db = null;
      dbPath = null;
      resolve();
    });
  });
}

function runQuery(sql, params = []) {
  return new Promise((resolve, reject) => {
    getDatabase().run(sql, params, function (err) {
      if (err) {
        reject(err);
        return;
      }
      resolve({ id: this.lastID, changes: this.changes });
    });
  });
}

function getQuery(sql, params = []) {
  return new Promise((resolve, reject) => {
    getDatabase().all(sql, params, (err, rows) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(rows);
    });
  });
}

function getSingleQuery(sql, params = []) {
  return new Promise((resolve, reject) => {
    getDatabase().get(sql, params, (err, row) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(row);
    });
  });
}

module.exports = {
  closeSqliteDatabase,
  connectSqliteDatabase,
  getDatabase,
  getDatabasePath,
  runQuery,
  getQuery,
  getSingleQuery
};
