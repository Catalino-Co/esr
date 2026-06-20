const { repositories } = require('./db/index.cjs');

async function findWorkOrderSummary(workOrderId) {
  return await repositories.checklists.findWorkOrderSummary(workOrderId);
}

async function findByWorkOrder(workOrderId, type) {
  return await repositories.checklists.findByWorkOrder(workOrderId, type);
}

async function replaceForWorkOrder(workOrderId, type, items) {
  return await repositories.checklists.replaceForWorkOrder(workOrderId, type, items);
}

async function findActiveIncidentKeys(workOrderId) {
  return await repositories.checklists.findActiveIncidentKeys(workOrderId);
}

async function createAutomaticIncident(input) {
  return await repositories.checklists.createAutomaticIncident(input);
}

module.exports = {
  createAutomaticIncident,
  findActiveIncidentKeys,
  findByWorkOrder,
  findWorkOrderSummary,
  replaceForWorkOrder
};
