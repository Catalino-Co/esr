const { getSingleQuery, runQuery } = require('../connection.cjs');

class SqliteCompanySettingsRepository {
  async get() {
    return await getSingleQuery('SELECT * FROM company_info WHERE id = 1');
  }

  async update(data) {
    await runQuery(
      `UPDATE company_info SET
        name=?, rnc=?, phone=?, email=?, address=?, logo_base64=?
       WHERE id=1`,
      [
        data.name,
        data.rnc || '',
        data.phone || '',
        data.email || '',
        data.address || '',
        data.logo_base64 || ''
      ]
    );

    return await this.get();
  }
}

module.exports = { SqliteCompanySettingsRepository };
