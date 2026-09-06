/**
 * Codigo de 4 digitos por paquete, empezando en 1001. Calcada de
 * `0012_quote_number.cjs`, sin prefijo de texto -solo el numero-.
 */
module.exports = {
  version: '0019',
  name: 'packages_code',
  async up({ addColumnIfMissing, getQuery, runQuery }) {
    await addColumnIfMissing('packages', 'code', 'TEXT');

    const pendientes = await getQuery(
      "SELECT id FROM packages WHERE code IS NULL OR code = '' ORDER BY id ASC"
    );
    let n = 1000;
    for (const fila of pendientes) {
      n += 1;
      await runQuery('UPDATE packages SET code = ? WHERE id = ?', [String(n), fila.id]);
    }

    await runQuery(
      'CREATE UNIQUE INDEX IF NOT EXISTS packages_code_unique ON packages (code) WHERE code IS NOT NULL'
    );
  }
};
