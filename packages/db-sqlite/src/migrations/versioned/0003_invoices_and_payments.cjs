/**
 * Facturas y cobros.
 *
 * Desktop no tenia forma de cobrar: `payments` no existia y el unico dinero
 * registrado eran los totales de la cotizacion y del conduce. La factura es el
 * documento que se cobra, cubre UNA O VARIAS entregas y es el unico ancla de un
 * pago.
 *
 * Puramente aditiva: no hay backfill porque no habia nada que migrar.
 */
module.exports = {
  version: '0003',
  name: 'invoices_and_payments',
  async up({ createIndexIfMissing, runQuery }) {
    // ── La factura ────────────────────────────────────────────────────────
    //
    // `invoice_seq` va aparte de `invoice_number` a proposito. SQLite no tiene
    // regex, asi que sacar el numero del texto obligaria a un `substr`
    // posicional que asume para siempre un prefijo de cuatro caracteres. El dia
    // que `invoice_number` quiera ser un NCF (B0100000123) eso revienta. Con una
    // columna numerica, `MAX(invoice_seq) + 1` es trivial e indexable.
    //
    // Sin CHECK, al contrario que Cloud: en SQLite cambiar un CHECK exige
    // reconstruir la tabla entera, y `status` va a ganar valores. La validacion
    // vive en el repositorio.
    //
    // `REAL` para el dinero porque TODO el esquema existente lo usa
    // (`conduces.total`, `conduce_items.price`, `items.rental_price`). Mezclar
    // centavos enteros obligaria a convertir en cada frontera y el primer olvido
    // seria un error de factor 100 en una factura. Se compensa redondeando a dos
    // decimales en cada escritura.
    await runQuery(`
      CREATE TABLE IF NOT EXISTS invoices (
        id             INTEGER PRIMARY KEY AUTOINCREMENT,
        invoice_seq    INTEGER NOT NULL,
        invoice_number TEXT    NOT NULL,
        work_order_id  INTEGER,
        client_id      INTEGER,
        date           TEXT,
        due_date       TEXT,
        status         TEXT    NOT NULL DEFAULT 'emitida',
        subtotal       REAL    NOT NULL DEFAULT 0.0,
        discount       REAL    NOT NULL DEFAULT 0.0,
        tax_amount     REAL    NOT NULL DEFAULT 0.0,
        total          REAL    NOT NULL DEFAULT 0.0,
        notes          TEXT,
        cancelled_at   TEXT,
        cancel_reason  TEXT,
        is_active      INTEGER NOT NULL DEFAULT 1,
        created_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at     DATETIME,
        FOREIGN KEY (work_order_id) REFERENCES work_orders(id),
        FOREIGN KEY (client_id)     REFERENCES clients(id)
      )
    `);

    // El unico sobre `invoice_seq` es el que frena la carrera de numeracion:
    // dos emisiones simultaneas leen el mismo maximo y la segunda choca aqui en
    // vez de persistir un numero repetido en silencio, que es lo que le pasa a
    // las cotizaciones.
    await createIndexIfMissing(
      'idx_invoices_seq',
      'CREATE UNIQUE INDEX idx_invoices_seq ON invoices (invoice_seq)'
    );
    await createIndexIfMissing(
      'idx_invoices_number',
      'CREATE UNIQUE INDEX idx_invoices_number ON invoices (invoice_number)'
    );
    await createIndexIfMissing(
      'idx_invoices_state',
      'CREATE INDEX idx_invoices_state ON invoices (is_active, status)'
    );
    await createIndexIfMissing(
      'idx_invoices_client',
      'CREATE INDEX idx_invoices_client ON invoices (client_id, is_active)'
    );
    await createIndexIfMissing(
      'idx_invoices_work_order',
      'CREATE INDEX idx_invoices_work_order ON invoices (work_order_id)'
    );

    // ── Las lineas ────────────────────────────────────────────────────────
    //
    // Se COPIAN de los conduces cubiertos, no se leen por join: una factura
    // emitida no puede cambiar porque alguien corrija el conduce despues.
    //
    // `quantity` es REAL aunque `conduce_items.quantity` sea INTEGER. La
    // cantidad de una ENTREGA es entera por naturaleza; la de una linea de
    // FACTURA no —«3 dias x 2 bocinas», medias jornadas—. Y en SQLite un tipo no
    // se cambia con ALTER: sale mas barato ahora que reconstruyendo la tabla.
    await runQuery(`
      CREATE TABLE IF NOT EXISTS invoice_items (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        invoice_id  INTEGER NOT NULL,
        item_id     INTEGER,
        description TEXT,
        quantity    REAL    NOT NULL DEFAULT 0.0,
        price       REAL    NOT NULL DEFAULT 0.0,
        total       REAL    NOT NULL DEFAULT 0.0,
        FOREIGN KEY (invoice_id) REFERENCES invoices(id),
        FOREIGN KEY (item_id)    REFERENCES items(id)
      )
    `);
    await createIndexIfMissing(
      'idx_invoice_items_invoice',
      'CREATE INDEX idx_invoice_items_invoice ON invoice_items (invoice_id)'
    );

    // ── Que entregas cubre ────────────────────────────────────────────────
    await runQuery(`
      CREATE TABLE IF NOT EXISTS invoice_conduces (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        invoice_id INTEGER NOT NULL,
        conduce_id INTEGER NOT NULL,
        is_active  INTEGER NOT NULL DEFAULT 1,
        FOREIGN KEY (invoice_id) REFERENCES invoices(id),
        FOREIGN KEY (conduce_id) REFERENCES conduces(id)
      )
    `);

    // El corazon del modulo, y por eso vive en el ESQUEMA y no en el codigo:
    // `db:run` deja al renderer ejecutar SQL arbitrario, asi que una invariante
    // escrita solo en un repositorio no es una invariante. El indice si se
    // cumple venga el SQL de donde venga.
    //
    // Es PARCIAL para que una entrega tenga un enlace vivo y N muertos. Un
    // UNIQUE a secas la dejaria presa de una factura anulada para siempre;
    // borrar la fila al anular perderia el rastro de que se facturo.
    await createIndexIfMissing(
      'idx_invoice_conduces_active',
      'CREATE UNIQUE INDEX idx_invoice_conduces_active ON invoice_conduces (conduce_id) WHERE is_active = 1'
    );
    await createIndexIfMissing(
      'idx_invoice_conduces_invoice',
      'CREATE INDEX idx_invoice_conduces_invoice ON invoice_conduces (invoice_id)'
    );

    // ── El cobro cuelga de la factura ─────────────────────────────────────
    await runQuery(`
      CREATE TABLE IF NOT EXISTS payments (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        invoice_id  INTEGER NOT NULL,
        client_id   INTEGER,
        date        TEXT,
        amount      REAL    NOT NULL DEFAULT 0.0,
        method      TEXT,
        reference   TEXT,
        status      TEXT    NOT NULL DEFAULT 'pagado',
        notes       TEXT,
        voided_at   TEXT,
        void_reason TEXT,
        created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (invoice_id) REFERENCES invoices(id),
        FOREIGN KEY (client_id)  REFERENCES clients(id)
      )
    `);
    await createIndexIfMissing(
      'idx_payments_invoice',
      'CREATE INDEX idx_payments_invoice ON payments (invoice_id, status)'
    );
    await createIndexIfMissing(
      'idx_payments_client',
      'CREATE INDEX idx_payments_client ON payments (client_id, status)'
    );
  }
};
