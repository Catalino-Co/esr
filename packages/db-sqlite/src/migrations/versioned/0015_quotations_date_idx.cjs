/**
 * El listado de cotizaciones pasa a filtrar por rango sobre `date`. Gemela de
 * `027_quotations_date_idx.sql` en Postgres.
 */
module.exports = {
  version: '0015',
  name: 'quotations_date_idx',
  async up({ createIndexIfMissing }) {
    await createIndexIfMissing(
      'quotations_date_idx',
      'CREATE INDEX quotations_date_idx ON quotations (date)'
    );
  }
};
