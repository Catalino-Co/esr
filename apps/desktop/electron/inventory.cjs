const { repositories } = require('./db/index.cjs');

async function reserveIfNeeded(workOrderId, status) {
  return await repositories.inventory.reserveIfNeeded(workOrderId, status);
}

async function reserveWorkOrderStock(workOrderId, status) {
  return await repositories.inventory.reserveWorkOrderStock(workOrderId, status);
}

async function reserveConduceStockIfNeeded(conduceId, status) {
  return await repositories.inventory.reserveConduceStockIfNeeded(conduceId, status);
}

module.exports = {
  reserveIfNeeded,
  reserveConduceStockIfNeeded,
  reserveWorkOrderStock
};
