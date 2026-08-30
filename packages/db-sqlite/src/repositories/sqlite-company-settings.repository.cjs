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

  /**
   * Los valores por defecto de operacion, que no son los datos impresos.
   *
   * UPDATE de UNA columna, y no `update()`: aquel escribe las seis y `name` es
   * NOT NULL, asi que guardar el impuesto por ahi borraria el nombre y la
   * direccion de la empresa. Dos pantallas distintas, dos escrituras
   * distintas.
   */
  async updateDefaults(data) {
    // Acotada a [0, 100]: una tasa negativa devolveria dinero y una del 150%
    // triplicaria el documento. El <input> ya lo impide, pero esto es lo que
    // de verdad escribe.
    const tasa = Math.min(100, Math.max(0, Number(data.default_tax_rate) || 0));
    await runQuery('UPDATE company_info SET default_tax_rate = ? WHERE id = 1', [tasa]);
    return await this.get();
  }
}

module.exports = { SqliteCompanySettingsRepository };
