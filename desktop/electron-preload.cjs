const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  listPrinters: () => ipcRenderer.invoke('printers:list'),
  printHtml: (payload) => ipcRenderer.invoke('printers:printHtml', payload),
});
