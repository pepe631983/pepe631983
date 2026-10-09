const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

const DEV_URL = process.env.TCI_APP_URL || 'http://localhost:5173';

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    webPreferences: {
      preload: path.join(__dirname, 'electron-preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    title: 'TCI Auto Zone',
  });

  if (process.env.NODE_ENV === 'development' || process.env.TCI_APP_URL) {
    void win.loadURL(DEV_URL);
  } else {
    void win.loadFile(path.join(__dirname, '../frontend/dist/index.html'));
  }
}

ipcMain.handle('printers:list', async () => {
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) return [];
  const list = await win.webContents.getPrintersAsync();
  return list.map((p) => ({ name: p.name, isDefault: p.isDefault }));
});

ipcMain.handle('printers:printHtml', async (_event, payload) => {
  const { html, printerName, copies = 1 } = payload;
  const printWin = new BrowserWindow({ show: false, webPreferences: { offscreen: true } });
  try {
    await printWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    await new Promise((resolve, reject) => {
      printWin.webContents.print(
        {
          silent: Boolean(printerName),
          deviceName: printerName || undefined,
          copies: Math.max(1, copies),
        },
        (success, failureReason) => {
          if (!success) reject(new Error(failureReason || 'Print failed'));
          else resolve(undefined);
        },
      );
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  } finally {
    printWin.destroy();
  }
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
