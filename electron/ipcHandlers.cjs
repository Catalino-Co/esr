const { ipcMain } = require('electron');
const { runQuery, getQuery, getSingleQuery } = require('./db/index.cjs');

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
}

module.exports = { setupIpcHandlers };
