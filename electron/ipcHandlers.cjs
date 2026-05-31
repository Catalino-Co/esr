const { ipcMain } = require('electron');
const { runQuery, getQuery, getSingleQuery } = require('./db/index.cjs');
const { createUser, login, updateUser } = require('./auth.cjs');

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
}

module.exports = { setupIpcHandlers };
