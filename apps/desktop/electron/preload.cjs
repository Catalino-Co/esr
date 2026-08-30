const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  db: {
    run: (sql, params) => ipcRenderer.invoke('db:run', sql, params),
    get: (sql, params) => ipcRenderer.invoke('db:get', sql, params),
    getOne: (sql, params) => ipcRenderer.invoke('db:getOne', sql, params)
  },
  auth: {
    login: (credentials) => ipcRenderer.invoke('auth:login', credentials),
    needsBootstrap: () => ipcRenderer.invoke('auth:needsBootstrap'),
    bootstrapAdmin: (data) => ipcRenderer.invoke('auth:bootstrapAdmin', data)
  },
  users: {
    create: (user) => ipcRenderer.invoke('users:create', user),
    update: (user) => ipcRenderer.invoke('users:update', user)
  },
  inventory: {
    reserveConduceStock: (conduceId, status) =>
      ipcRenderer.invoke('inventory:reserveConduceStock', conduceId, status),
    reserveWorkOrderStock: (workOrderId, status) =>
      ipcRenderer.invoke('inventory:reserveWorkOrderStock', workOrderId, status)
  },
  checklists: {
    findWorkOrderSummary: (workOrderId) =>
      ipcRenderer.invoke('checklists:findWorkOrderSummary', workOrderId),
    findByWorkOrder: (workOrderId, type) =>
      ipcRenderer.invoke('checklists:findByWorkOrder', workOrderId, type),
    replaceForWorkOrder: (workOrderId, type, items) =>
      ipcRenderer.invoke('checklists:replaceForWorkOrder', workOrderId, type, items),
    findActiveIncidentKeys: (workOrderId) =>
      ipcRenderer.invoke('checklists:findActiveIncidentKeys', workOrderId),
    createAutomaticIncident: (input) =>
      ipcRenderer.invoke('checklists:createAutomaticIncident', input)
  },
  quotes: {
    findById: (id) => ipcRenderer.invoke('quotes:findById', id),
    listItems: (id) => ipcRenderer.invoke('quotes:listItems', id),
    findForEdit: (id) => ipcRenderer.invoke('quotes:findForEdit', id),
    save: (input) => ipcRenderer.invoke('quotes:save', input)
  },
  invoices: {
    list: (filters) => ipcRenderer.invoke('invoices:list', filters),
    findById: (id) => ipcRenderer.invoke('invoices:findById', id),
    listItems: (id) => ipcRenderer.invoke('invoices:listItems', id),
    listConduces: (id) => ipcRenderer.invoke('invoices:listConduces', id),
    listBillable: (workOrderId) => ipcRenderer.invoke('invoices:listBillable', workOrderId),
    listOrdersWithBillable: (options) =>
      ipcRenderer.invoke('invoices:listOrdersWithBillable', options),
    findByConduce: (conduceId) => ipcRenderer.invoke('invoices:findByConduce', conduceId),
    previewLines: (conduceIds) => ipcRenderer.invoke('invoices:previewLines', conduceIds),
    create: (input) => ipcRenderer.invoke('invoices:create', input),
    cancel: (id, reason) => ipcRenderer.invoke('invoices:cancel', id, reason),
    setState: (id, state) => ipcRenderer.invoke('invoices:setState', id, state)
  },
  payments: {
    listForInvoice: (invoiceId) => ipcRenderer.invoke('payments:listForInvoice', invoiceId),
    create: (input) => ipcRenderer.invoke('payments:create', input),
    void: (id, reason) => ipcRenderer.invoke('payments:void', id, reason),
    clientBalance: (clientId) => ipcRenderer.invoke('payments:clientBalance', clientId)
  },
  settings: {
    getCompany: () => ipcRenderer.invoke('settings:getCompany'),
    updateCompany: (data) => ipcRenderer.invoke('settings:updateCompany', data),
    updateDefaults: (data) => ipcRenderer.invoke('settings:updateDefaults', data)
  }
});
