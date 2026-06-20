const { ipcMain } = require('electron');
const { runQuery, getQuery, getSingleQuery } = require('./db/index.cjs');
const { createUser, login, updateUser } = require('./auth.cjs');
const { reserveConduceStockIfNeeded, reserveIfNeeded } = require('./inventory.cjs');
const {
  createAutomaticIncident,
  findActiveIncidentKeys,
  findByWorkOrder,
  findWorkOrderSummary,
  replaceForWorkOrder
} = require('./checklists.cjs');
const { getCompanySettings, updateCompanySettings } = require('./settings.cjs');

function setupIpcHandlers() {
  ipcMain.handle('db:run', async (event, sql, params) => {
    return await runQuery(sql, params);
  });
  
  ipcMain.handle('db:get', async (event, sql, params) => {
    return await getQuery(sql, params);
  });
  
  ipcMain.handle('db:getOne', async (event, sql, params) => {
    return await getSingleQuery(sql, params);
  });

  ipcMain.handle('auth:login', async (event, credentials) => {
    return await login(credentials?.username, credentials?.password);
  });

  ipcMain.handle('users:create', async (event, user) => {
    return await createUser(user);
  });

  ipcMain.handle('users:update', async (event, user) => {
    return await updateUser(user);
  });

  ipcMain.handle('inventory:reserveWorkOrderStock', async (event, workOrderId, status) => {
    return await reserveIfNeeded(workOrderId, status);
  });

  ipcMain.handle('inventory:reserveConduceStock', async (event, conduceId, status) => {
    return await reserveConduceStockIfNeeded(conduceId, status);
  });

  ipcMain.handle('checklists:findWorkOrderSummary', async (event, workOrderId) => {
    return await findWorkOrderSummary(workOrderId);
  });

  ipcMain.handle('checklists:findByWorkOrder', async (event, workOrderId, type) => {
    return await findByWorkOrder(workOrderId, type);
  });

  ipcMain.handle('checklists:replaceForWorkOrder', async (event, workOrderId, type, items) => {
    return await replaceForWorkOrder(workOrderId, type, items);
  });

  ipcMain.handle('checklists:findActiveIncidentKeys', async (event, workOrderId) => {
    return await findActiveIncidentKeys(workOrderId);
  });

  ipcMain.handle('checklists:createAutomaticIncident', async (event, input) => {
    return await createAutomaticIncident(input);
  });

  ipcMain.handle('settings:getCompany', async () => {
    return await getCompanySettings();
  });

  ipcMain.handle('settings:updateCompany', async (event, data) => {
    return await updateCompanySettings(data);
  });
}

module.exports = { setupIpcHandlers };
