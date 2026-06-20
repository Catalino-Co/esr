const { repositories } = require('./db/index.cjs');

async function getCompanySettings() {
  return await repositories.companySettings.get();
}

async function updateCompanySettings(data) {
  return await repositories.companySettings.update(data);
}

module.exports = {
  getCompanySettings,
  updateCompanySettings
};
