const { repositories } = require('./db/index.cjs');

async function getCompanySettings() {
  return await repositories.companySettings.get();
}

async function updateCompanySettings(data) {
  return await repositories.companySettings.update(data);
}

/**
 * Los valores por defecto de operacion, que NO son los datos impresos.
 *
 * Escritura aparte de `updateCompanySettings` a proposito: aquella escribe las
 * seis columnas y `name` es NOT NULL, asi que guardar el impuesto por ahi
 * borraria el nombre y la direccion de la empresa. Dos pantallas, dos
 * escrituras.
 */
async function updateCompanyDefaults(data) {
  return await repositories.companySettings.updateDefaults(data);
}

module.exports = {
  getCompanySettings,
  updateCompanySettings,
  updateCompanyDefaults
};
