const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('todoApi', {
  getState: () => ipcRenderer.invoke('tasks:get-state'),
  addTask: (text, date) => ipcRenderer.invoke('tasks:add', text, date),
  toggleTask: (id, date) => ipcRenderer.invoke('tasks:toggle', id, date),
  deleteTask: (id, date) => ipcRenderer.invoke('tasks:delete', id, date),
  minimizeToTray: () => ipcRenderer.invoke('window:minimize-to-tray'),
  openHistory: () => ipcRenderer.invoke('window:open-history'),
  closeHistory: () => ipcRenderer.invoke('window:close-history'),
  getStartupSettings: () => ipcRenderer.invoke('settings:get-startup'),
  setOpenAtLogin: (enabled) => ipcRenderer.invoke('settings:set-open-at-login', enabled),
  onTasksUpdated: (callback) => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on('tasks:updated', listener);
    return () => ipcRenderer.removeListener('tasks:updated', listener);
  }
});
