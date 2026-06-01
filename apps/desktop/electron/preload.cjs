const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  db: {
    run: (sql, params) => ipcRenderer.invoke('db:run', sql, params),
    get: (sql, params) => ipcRenderer.invoke('db:get', sql, params),
    getOne: (sql, params) => ipcRenderer.invoke('db:getOne', sql, params)
  },
  auth: {
    login: (credentials) => ipcRenderer.invoke('auth:login', credentials)
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
  }
});
