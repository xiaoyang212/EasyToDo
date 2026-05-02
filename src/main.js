const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');

const MIN_WIDTH = 300;
const MIN_HEIGHT = 200;

let mainWindow;
let historyWindow;
let tray;
let storePath;
let store = {};

const appIcon = path.join(__dirname, '..', 'build', 'icon.ico');

function dateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function readStore() {
  try {
    if (!fs.existsSync(storePath)) {
      store = {};
      return;
    }

    const raw = fs.readFileSync(storePath, 'utf8');
    store = raw.trim() ? JSON.parse(raw) : {};
  } catch (error) {
    console.error('Failed to read todo store:', error);
    store = {};
  }
}

function writeStore() {
  fs.mkdirSync(path.dirname(storePath), { recursive: true });
  fs.writeFileSync(storePath, JSON.stringify(store, null, 2), 'utf8');
}

function tasksFor(date) {
  if (!store[date]) {
    store[date] = [];
  }
  return store[date];
}

function publicState() {
  return {
    today: dateKey(),
    tasksByDate: store
  };
}

function broadcastState() {
  const state = publicState();
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('tasks:updated', state);
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 380,
    height: 560,
    minWidth: MIN_WIDTH,
    minHeight: MIN_HEIGHT,
    frame: false,
    transparent: true,
    resizable: true,
    alwaysOnTop: true,
    skipTaskbar: false,
    title: 'Todo List',
    icon: appIcon,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.setAlwaysOnTop(true, 'screen-saver');
  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  mainWindow.on('minimize', (event) => {
    event.preventDefault();
    mainWindow.hide();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function createHistoryWindow() {
  if (historyWindow && !historyWindow.isDestroyed()) {
    historyWindow.show();
    historyWindow.focus();
    return;
  }

  historyWindow = new BrowserWindow({
    width: 780,
    height: 560,
    minWidth: 620,
    minHeight: 420,
    frame: false,
    transparent: true,
    resizable: true,
    alwaysOnTop: true,
    title: 'Todo History',
    icon: appIcon,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  historyWindow.setAlwaysOnTop(true, 'screen-saver');
  historyWindow.loadFile(path.join(__dirname, 'index.html'), {
    query: { view: 'history' }
  });

  historyWindow.on('closed', () => {
    historyWindow = null;
  });
}

function createTray() {
  const icon = nativeImage.createFromPath(appIcon);

  tray = new Tray(icon);
  tray.setToolTip('Todo List');
  tray.setContextMenu(Menu.buildFromTemplate([
    {
      label: '显示待办',
      click: () => {
        if (!mainWindow) {
          createWindow();
        }
        mainWindow.show();
        mainWindow.focus();
      }
    },
    {
      label: '查看历史',
      click: createHistoryWindow
    },
    { type: 'separator' },
    {
      label: '退出',
      click: () => app.quit()
    }
  ]));

  tray.on('click', () => {
    if (mainWindow) {
      mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show();
    }
  });
}

app.whenReady().then(() => {
  storePath = path.join(app.getPath('userData'), 'tasks.json');
  readStore();
  createWindow();
  createTray();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    } else if (mainWindow) {
      mainWindow.show();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

ipcMain.handle('tasks:get-state', () => publicState());

ipcMain.handle('tasks:add', (_event, text, requestedDate) => {
  const cleanText = String(text || '').trim();
  const targetDate = requestedDate || dateKey();
  if (!cleanText) {
    return publicState();
  }

  tasksFor(targetDate).push({
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    text: cleanText,
    completed: false,
    createdAt: Date.now()
  });
  writeStore();
  broadcastState();
  return publicState();
});

ipcMain.handle('tasks:toggle', (_event, id, requestedDate) => {
  const targetDate = requestedDate || dateKey();
  const task = tasksFor(targetDate).find((item) => item.id === id);
  if (task) {
    task.completed = !task.completed;
    task.updatedAt = Date.now();
    writeStore();
    broadcastState();
  }
  return publicState();
});

ipcMain.handle('tasks:delete', (_event, id, requestedDate) => {
  const targetDate = requestedDate || dateKey();
  store[targetDate] = tasksFor(targetDate).filter((item) => item.id !== id);
  writeStore();
  broadcastState();
  return publicState();
});

ipcMain.handle('window:minimize-to-tray', (event) => {
  BrowserWindow.fromWebContents(event.sender)?.hide();
});

ipcMain.handle('window:close-history', (event) => {
  BrowserWindow.fromWebContents(event.sender)?.close();
});

ipcMain.handle('window:open-history', () => {
  createHistoryWindow();
});
