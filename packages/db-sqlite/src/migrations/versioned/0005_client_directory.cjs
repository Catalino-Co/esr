/**
 * Modulo de clientes: direcciones de servicio y datos comerciales.
 *
 * Espejo de la migracion 016 de PostgreSQL. Dos conceptos de direccion que
 * conviven a proposito:
 *
 *   * `clients.address`  → direccion FISCAL, la de los documentos.
 *   * `client_addresses` → direcciones de SERVICIO, donde se monta o entrega.
 *
 * Aditiva: no hay backfill porque no habia nada que migrar. Los tres campos
 * nuevos de `clients` quedan NULL y asi se quedan; rellenarlos seria escribir
 * una afirmacion fiscal que nadie hizo.
 */
module.exports = {
  version: '0005',
  name: 'client_directory',
  async up({ addColumnIfMissing, createIndexIfMissing, runQuery }) {
    // ── Catalogos nuevos ──────────────────────────────────────────────────
    //
    // Mismas columnas que `event_types` y compania, para que las pantallas de
    // Configuracion se clonen sin excepciones.
    await runQuery(`
      CREATE TABLE IF NOT EXISTS commercial_sectors (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        name        TEXT NOT NULL,
        description TEXT,
        is_active   INTEGER NOT NULL DEFAULT 1,
        created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await runQuery(`
      CREATE TABLE IF NOT EXISTS client_address_types (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        name        TEXT NOT NULL,
        description TEXT,
        is_active   INTEGER NOT NULL DEFAULT 1,
        created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Unicidad sobre el nombre normalizado, para que «Sucursal» y «sucursal »
    // no puedan convivir. Va como indice de expresion: `LOWER` y `TRIM` son
    // deterministas y SQLite las admite ahi.
    await createIndexIfMissing(
      'idx_commercial_sectors_name',
      'CREATE UNIQUE INDEX idx_commercial_sectors_name ON commercial_sectors (LOWER(TRIM(name)))'
    );
    await createIndexIfMissing(
      'idx_client_address_types_name',
      'CREATE UNIQUE INDEX idx_client_address_types_name ON client_address_types (LOWER(TRIM(name)))'
    );

    // Sembrado: un desplegable vacio parece una pantalla rota, y el usuario no
    // tiene por que adivinar que primero hay que ir a Configuracion.
    const SECTORES = [
      'Eventos', 'Restaurantes', 'Hoteles', 'Manufactura', 'Retail', 'Servicios', 'Educación'
    ];
    for (const name of SECTORES) {
      await runQuery('INSERT OR IGNORE INTO commercial_sectors (name) VALUES (?)', [name]);
    }

    const TIPOS = ['Sucursal', 'Almacén', 'Oficina', 'Salón', 'Domicilio', 'Obra'];
    for (const name of TIPOS) {
      await runQuery('INSERT OR IGNORE INTO client_address_types (name) VALUES (?)', [name]);
    }

    // ── Datos comerciales del cliente ─────────────────────────────────────
    //
    // Sin CHECK, al contrario que Cloud: en SQLite cambiar un CHECK exige
    // reconstruir la tabla entera. La validacion vive en el formulario y en
    // `@esr/core`, que es de donde salen las dos listas.
    await addColumnIfMissing('clients', 'document_type', 'TEXT');
    await addColumnIfMissing('clients', 'payment_terms', 'TEXT');
    await addColumnIfMissing('clients', 'sector_id', 'INTEGER');

    // ── Direcciones de servicio ───────────────────────────────────────────
    //
    // Las FK se declaran por documentacion: `PRAGMA foreign_keys` esta apagado
    // en la app, asi que no las hace cumplir nadie. Se escriben igual para que
    // el esquema diga la verdad sobre lo que apunta a que.
    //
    // NULL en contacto/telefono/email significa HEREDA del cliente, y se
    // resuelve al leer con COALESCE. Consecuencia: aqui no se escribe NUNCA
    // cadena vacia, o se pierde la diferencia entre «heredo» y «no tiene».
    // El celular no hereda: el cliente no tiene celular.
    await runQuery(`
      CREATE TABLE IF NOT EXISTS client_addresses (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        client_id       INTEGER NOT NULL,
        label           TEXT    NOT NULL,
        address_type_id INTEGER,
        address         TEXT    NOT NULL,
        contact_person  TEXT,
        phone           TEXT,
        email           TEXT,
        mobile          TEXT,
        notes           TEXT,
        is_primary      INTEGER NOT NULL DEFAULT 0,
        is_active       INTEGER NOT NULL DEFAULT 1,
        created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (client_id) REFERENCES clients(id),
        FOREIGN KEY (address_type_id) REFERENCES client_address_types(id)
      )
    `);

    await createIndexIfMissing(
      'idx_client_addresses_client',
      'CREATE INDEX idx_client_addresses_client ON client_addresses (client_id, is_active)'
    );

    // Parcial sobre las no archivadas: asi se puede volver a crear «Sucursal
    // Herrera» despues de haber archivado la vieja.
    await createIndexIfMissing(
      'idx_client_addresses_label',
      `CREATE UNIQUE INDEX idx_client_addresses_label
         ON client_addresses (client_id, LOWER(TRIM(label)))
         WHERE is_active <> 0`
    );

    // ── Por que NO hay indice unico sobre `is_primary` ────────────────────
    //
    // Marcar una principal implica apagar la anterior, y el motor valida los
    // indices unicos FILA A FILA durante el UPDATE, no al final de la
    // sentencia: segun el orden fisico habria dos filas en 1 a la vez y
    // saltaria el conflicto. La invariante la garantiza la forma de la
    // sentencia, que es UNA sola y por tanto atomica:
    //
    //   UPDATE client_addresses
    //      SET is_primary = CASE WHEN id = ? THEN 1 ELSE 0 END
    //    WHERE client_id = ?
    //
    // Efecto colateral util: ninguna operacion sobre direcciones necesita
    // transaccion, y por eso el renderer puede hacerlas por `window.api.db`.
  }
};
