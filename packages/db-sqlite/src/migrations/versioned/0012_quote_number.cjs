/**
 * La cotizacion de ESR Pro gana NUMERO PROPIO.
 *
 * Hasta ahora el escritorio no tenia la columna: la pantalla escribia
 * `#${id.padStart(5)}` a partir de la clave primaria. Eso no es un numero de
 * documento, es el id disfrazado — cambia si se reordena o se borra algo, y no
 * coincide con el `COT-000014` que Cloud imprime desde el mismo generador de
 * PDF. `quoteDocumentNumber` ya prefiere `quote_number` y solo caia al id
 * porque aqui no habia nada que preferir.
 *
 * Gemela de `014_quote_number_unique.sql` en Postgres, y con su misma guarda:
 * si hubiera repetidos NO se renumera automaticamente. Un numero de cotizacion
 * es un documento que el cliente ya vio, asi que elegir un ganador a ciegas no
 * le corresponde a una migracion.
 *
 * Aditiva y neutra en lo que ya existe: las filas se numeran por orden de `id`,
 * asi que la cotizacion 1 pasa a ser COT-000001 — el mismo orden que la
 * pantalla venia enseñando.
 */
module.exports = {
  version: '0012',
  name: 'quote_number',
  async up({ addColumnIfMissing, getQuery, runQuery }) {
    await addColumnIfMissing('quotations', 'quote_number', 'TEXT');

    // ── Rellenar lo que no tenga numero ──────────────────────────────────
    //
    // Por orden de `id` y solo donde falta: si la migracion se repitiera sobre
    // una base a medias, no reescribe lo ya numerado.
    const pendientes = await getQuery(
      'SELECT id FROM quotations WHERE quote_number IS NULL OR quote_number = \'\' ORDER BY id ASC'
    );
    for (const fila of pendientes) {
      const numero = `COT-${String(fila.id).padStart(6, '0')}`;
      await runQuery('UPDATE quotations SET quote_number = ? WHERE id = ?', [numero, fila.id]);
    }

    // ── Y solo entonces, el indice unico ─────────────────────────────────
    //
    // Antes se comprueba que no haya repetidos, porque `CREATE UNIQUE INDEX`
    // sobre datos duplicados falla con un mensaje que no dice CUALES. Fallar
    // aqui, diciendolo, es la diferencia entre saber que arreglar y no.
    const repetidos = await getQuery(
      `SELECT quote_number FROM quotations
       WHERE quote_number IS NOT NULL
       GROUP BY quote_number HAVING COUNT(*) > 1`
    );
    if (repetidos.length) {
      const lista = repetidos.map((r) => r.quote_number).join(', ');
      throw new Error(
        `Hay numeros de cotizacion repetidos y no se puede crear el indice unico: ${lista}. ` +
          'Renumerelos antes de aplicar esta migracion.'
      );
    }

    // Indice PARCIAL: los nulos quedan fuera. Sin el `WHERE`, SQLite trata cada
    // NULL como distinto y el indice funcionaria igual, pero declararlo deja
    // claro que la ausencia de numero no es un valor que compita.
    await runQuery(
      'CREATE UNIQUE INDEX IF NOT EXISTS quotations_quote_number_unique ' +
        'ON quotations (quote_number) WHERE quote_number IS NOT NULL'
    );
  }
};
