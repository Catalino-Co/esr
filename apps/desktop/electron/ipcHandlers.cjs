const { ipcMain } = require('electron');
const { runQuery, getQuery, getSingleQuery } = require('./db/index.cjs');
const { bootstrapAdmin, createUser, login, needsBootstrap, updateUser } = require('./auth.cjs');
const { reserveConduceStockIfNeeded, reserveIfNeeded } = require('./inventory.cjs');
const {
  createAutomaticIncident,
  findActiveIncidentKeys,
  findByWorkOrder,
  findWorkOrderSummary,
  replaceForWorkOrder
} = require('./checklists.cjs');
const { getCompanySettings, updateCompanySettings } = require('./settings.cjs');
const facturacion = require('./invoices.cjs');

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

  // Primer arranque: sin usuarios, la pantalla de acceso pide crear el
  // administrador en lugar de pedir credenciales que no existen.
  ipcMain.handle('auth:needsBootstrap', async () => {
    return await needsBootstrap();
  });

  ipcMain.handle('auth:bootstrapAdmin', async (event, data) => {
    return await bootstrapAdmin(data);
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

  // ── Facturas y cobros ─────────────────────────────────────────────────
  //
  // Devuelven `{ok, data|error}` en vez de lanzar: ver la cabecera de
  // `invoices.cjs`.
  ipcMain.handle('invoices:list', (event, filters) => facturacion.listInvoices(filters));
  ipcMain.handle('invoices:findById', (event, id) => facturacion.findInvoice(id));
  ipcMain.handle('invoices:listItems', (event, id) => facturacion.listInvoiceItems(id));
  ipcMain.handle('invoices:listConduces', (event, id) => facturacion.listInvoiceConduces(id));
  ipcMain.handle('invoices:listBillable', (event, woId) => facturacion.listBillableConduces(woId));
  ipcMain.handle('invoices:listOrdersWithBillable', (event, options) =>
    facturacion.listOrdersWithBillable(options)
  );
  ipcMain.handle('invoices:findByConduce', (event, id) => facturacion.findInvoiceByConduce(id));
  ipcMain.handle('invoices:previewLines', (event, ids) => facturacion.previewInvoiceLines(ids));
  ipcMain.handle('invoices:create', (event, input) => facturacion.createInvoice(input));
  ipcMain.handle('invoices:cancel', (event, id, reason) => facturacion.cancelInvoice(id, reason));
  ipcMain.handle('invoices:setState', (event, id, state) => facturacion.setInvoiceState(id, state));

  ipcMain.handle('payments:listForInvoice', (event, id) => facturacion.listPayments(id));
  ipcMain.handle('payments:create', (event, input) => facturacion.createPayment(input));
  ipcMain.handle('payments:void', (event, id, reason) => facturacion.voidPayment(id, reason));
  ipcMain.handle('payments:clientBalance', (event, id) => facturacion.clientBalance(id));

  ipcMain.handle('settings:getCompany', async () => {
    return await getCompanySettings();
  });

  ipcMain.handle('settings:updateCompany', async (event, data) => {
    return await updateCompanySettings(data);
  });
}

module.exports = { setupIpcHandlers };
