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

/**
 * Transacciones sobre una conexion compartida.
 *
 * En `db-postgres` la pregunta "estoy dentro de una transaccion?" viaja en un
 * parametro (`client: pg.PoolClient`). Aqui no hay tal parametro: `db` es una
 * variable de modulo y `BEGIN`/`COMMIT` operan sobre estado ambiental. Eso
 * produce dos fallos que no avisan:
 *
 *   * Anidamiento. Si A abre transaccion y llama a B, que tambien hace BEGIN,
 *     SQLite responde "cannot start a transaction within a transaction", y el
 *     ROLLBACK de B deshace ademas el trabajo de A.
 *   * Concurrencia. Dos invocaciones IPC a la vez —un doble clic en «Emitir»—
 *     hacen exactamente lo mismo. Los `await` de cada llamador ordenan sus
 *     propias sentencias, no las de los demas.
 *
 * `withTransaction` resuelve las dos: encadena las llamadas en una cola de
 * promesas, asi que solo hay una transaccion viva a la vez y el resto espera.
 *
 * CONVENCION en los repositorios: un metodo con prefijo `tx` ASUME que ya hay
 * transaccion abierta y no hace BEGIN ni COMMIT. Los publicos abren la suya.
 */
let cola = Promise.resolve();

function withTransaction(fn) {
  const siguiente = cola.then(async () => {
    await runQuery('BEGIN IMMEDIATE TRANSACTION');
    try {
      const resultado = await fn();
      await runQuery('COMMIT');
      return resultado;
    } catch (error) {
      // El ROLLBACK se traga su propio error a proposito: el que importa es el
      // original, y perderlo dejaria el fallo sin diagnostico.
      try {
        await runQuery('ROLLBACK');
      } catch {
        /* ignorado */
      }
      throw error;
    }
  });

  // La cola no se rompe cuando una transaccion falla: la siguiente debe poder
  // ejecutarse igual.
  cola = siguiente.then(
    () => undefined,
    () => undefined
  );

  return siguiente;
}

module.exports = {
  closeSqliteDatabase,
  connectSqliteDatabase,
  getDatabase,
  getDatabasePath,
  runQuery,
  getQuery,
  getSingleQuery,
  withTransaction
};
