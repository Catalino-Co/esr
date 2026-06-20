const { initDatabase: initLegacySchema } = require('../initial-schema.cjs');

module.exports = {
  version: '0001',
  name: 'initial_schema',
  transaction: false,
  async up() {
    await initLegacySchema();
  }
};
