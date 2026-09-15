/**
 * Codigo interno unico, solo cuando existe. Calcada de `0019_packages_code.cjs`
 * -mismo indice parcial-, sin numeracion retroactiva: a diferencia de `code`
 * en `packages`, `internal_code` ya viene siendo opcional y de texto libre
 * desde el inicio, asi que no hay nada que backfillear, solo el indice.
 */
module.exports = {
  version: '0022',
  name: 'items_internal_code_unique',
  async up({ runQuery }) {
    await runQuery(
      'CREATE UNIQUE INDEX IF NOT EXISTS items_internal_code_unique ON items (internal_code) WHERE internal_code IS NOT NULL'
    );
  }
};
