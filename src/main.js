const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');

const MIN_WIDTH = 300;
const MIN_HEIGHT = 200;

let mainWindow;
let historyWindow;
let tray;
let storePath;
let store = {};
let isQuitting = false;

const appIcon = path.join(__dirname, '..', 'build', 'icon.ico');
const hiddenStartupArg = '--hidden';
const startupRegistryKey = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';
const startupRegistryName = 'EasyToDo';

app.setAppUserModelId('com.easytodo.desktop');

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

function getLoginItemOptions() {
  const args = app.isPackaged
    ? [hiddenStartupArg]
    : [app.getAppPath(), hiddenStartupArg];

  return {
    args,
    name: 'EasyToDo',
    path: process.execPath
  };
}

function getLegacyLoginItemOptions() {
  return {
    name: 'EasyToDo',
    path: process.execPath
  };
}

function quoteCommandPart(part) {
  return `"${String(part).replace(/"/g, '')}"`;
}

function getWindowsStartupCommand() {
  const parts = app.isPackaged
    ? [process.execPath, hiddenStartupArg]
    : [process.execPath, app.getAppPath(), hiddenStartupArg];

  return parts.map(quoteCommandPart).join(' ');
}

function getWindowsRegistryStartup() {
  try {
    const output = execFileSync('reg.exe', [
      'query',
      startupRegistryKey,
      '/v',
      startupRegistryName
    ], { encoding: 'utf8', windowsHide: true });

    return output.includes(startupRegistryName);
  } catch (_error) {
    return false;
  }
}

function setWindowsRegistryStartup(openAtLogin) {
  if (openAtLogin) {
    execFileSync('reg.exe', [
      'add',
      startupRegistryKey,
      '/v',
      startupRegistryName,
      '/t',
      'REG_SZ',
      '/d',
      getWindowsStartupCommand(),
      '/f'
    ], { windowsHide: true });
    return;
  }

  try {
    execFileSync('reg.exe', [
      'delete',
      startupRegistryKey,
      '/v',
      startupRegistryName,
      '/f'
    ], { windowsHide: true });
  } catch (_error) {
    // Deleting a missing startup item is already the desired final state.
  }
}

function getStartupSettings() {
  const options = getLoginItemOptions();
  const legacyOptions = getLegacyLoginItemOptions();
  if (process.platform === 'win32') {
    return {
      openAtLogin: getWindowsRegistryStartup()
    };
  }

  return {
    openAtLogin: app.getLoginItemSettings(options).openAtLogin
      || app.getLoginItemSettings(legacyOptions).openAtLogin
  };
}

function setOpenAtLogin(openAtLogin) {
  const options = getLoginItemOptions();
  const legacyOptions = getLegacyLoginItemOptions();

  if (process.platform === 'win32') {
    setWindowsRegistryStartup(openAtLogin);
    updateTrayMenu();
    return getStartupSettings();
  }

  app.setLoginItemSettings({
    openAtLogin: false,
    ...legacyOptions
  });

  app.setLoginItemSettings({
    openAtLogin,
    openAsHidden: true,
    ...options
  });
  updateTrayMenu();
  return getStartupSettings();
}

function shouldStartHidden() {
  const loginSettings = app.getLoginItemSettings(getLoginItemOptions());
  return process.argv.includes(hiddenStartupArg)
    || loginSettings.wasOpenedAtLogin
    || loginSettings.wasOpenedAsHidden;
}

function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow({ showOnReady: true });
    return;
  }

  mainWindow.setSkipTaskbar(true);
  mainWindow.show();
  mainWindow.focus();
}

function createWindow(options = {}) {
  const { showOnReady = false } = options;

  mainWindow = new BrowserWindow({
    width: 380,
    height: 560,
    minWidth: MIN_WIDTH,
    minHeight: MIN_HEIGHT,
    frame: false,
    transparent: true,
    resizable: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
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

  if (showOnReady) {
    mainWindow.once('ready-to-show', () => showMainWindow());
  }

  mainWindow.on('minimize', (event) => {
    event.preventDefault();
    mainWindow.hide();
  });

  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
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
    skipTaskbar: true,
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
  tray.setToolTip('EasyToDo');
  updateTrayMenu();

  tray.on('click', () => {
    if (!mainWindow || !mainWindow.isVisible()) {
      showMainWindow();
    } else {
      mainWindow.hide();
    }
  });
}

function updateTrayMenu() {
  if (!tray) {
    return;
  }

  tray.setContextMenu(Menu.buildFromTemplate([
    {
      label: '显示待办',
      click: showMainWindow
    },
    {
      label: '查看历史',
      click: createHistoryWindow
    },
    {
      label: '开机自启',
      type: 'checkbox',
      checked: getStartupSettings().openAtLogin,
      click: (item) => setOpenAtLogin(item.checked)
    },
    { type: 'separator' },
    {
      label: '退出',
      click: () => {
        isQuitting = true;
        app.quit();
      }
    }
  ]));
}

app.whenReady().then(() => {
  storePath = path.join(app.getPath('userData'), 'tasks.json');
  readStore();
  createTray();
  createWindow({ showOnReady: !shouldStartHidden() });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow({ showOnReady: true });
    } else if (mainWindow) {
      showMainWindow();
    }
  });
});

app.on('before-quit', () => {
  isQuitting = true;
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

ipcMain.handle('settings:get-startup', () => getStartupSettings());

ipcMain.handle('settings:set-open-at-login', (_event, openAtLogin) => {
  return setOpenAtLogin(Boolean(openAtLogin));
});
