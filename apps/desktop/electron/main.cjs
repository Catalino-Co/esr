const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const isDev = require('electron-is-dev');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    title: "ESR Pro - Events Stock & Rentals",
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  if (isDev) {
    process.env['ELECTRON_DISABLE_SECURITY_WARNINGS'] = 'true';
    const loadURLWithRetry = async (url, retries = 15, delay = 1000) => {
      for (let i = 0; i < retries; i++) {
        try {
          await mainWindow.loadURL(url);
          return;
        } catch (err) {
          if (i === retries - 1) throw err;
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    };
    loadURLWithRetry('http://localhost:5175').then(() => {
      mainWindow.webContents.openDevTools();
    }).catch(err => {
      console.error("Failed to load local dev server", err);
    });
  } else {
    mainWindow.loadFile(path.join(__dirname, '../build/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

const { initDB, createLocalSqliteBackup } = require('./db/index.cjs');
const { seedDB } = require('./db/seed.cjs');
const { setupIpcHandlers } = require('./ipcHandlers.cjs');

/**
 * Un fallo al respaldar NO impide arrancar: dejar al usuario fuera de su propia
 * aplicacion porque no se pudo copiar un fichero seria peor que el riesgo que
 * se intenta cubrir. Se avisa por consola y se sigue.
 */
async function respaldarAntesDeMigrar() {
  try {
    const destino = path.join(app.getPath('userData'), 'backups');
    const { filename } = await createLocalSqliteBackup(destino);
    console.log(`Respaldo previo a la migracion: ${filename}`);
  } catch (error) {
    console.warn('No se pudo respaldar antes de migrar:', error.message);
  }
}

app.whenReady().then(async () => {
  try {
    // Copia antes de migrar. Ninguna migracion tiene `down`, asi que sin esto
    // un fallo a media migracion deja la base del cliente sin vuelta atras.
    // `createLocalSqliteBackup` existia desde hace meses sin que nadie la
    // llamase.
    await respaldarAntesDeMigrar();
    await initDB();
    console.log("Database initialized successfully.");
    await seedDB();
  } catch (error) {
    console.error("Database initialization failed:", error);
  }
  
  setupIpcHandlers();
  
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Basic IPC test
ipcMain.handle('ping', () => 'pong');
