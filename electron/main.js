const { app, BrowserWindow, Menu } = require('electron');
const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');
const CONFIG_FILE = path.join(ROOT, 'config.json');

let port = 3000;
let panelWin = null;
let helpWin = null;

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function dataDir() {
  if (process.env.OVERLAY_DATA_DIR) return process.env.OVERLAY_DATA_DIR;
  if (app.isPackaged) return app.getPath('userData');
  return ROOT;
}

function dataPath(name) {
  return path.join(dataDir(), name);
}

const CLEAN_CONFIG = {
  port: 3000,
  channel: '',
  obs: { enabled: false, host: 'localhost', port: 4455, password: '' },
  chat: { visible: true, scale: 0.75 },
  layout: {
    chat: { x: 0, y: 0, w: 18.6, h: 24.1 },
    embed: { x: 84.6, y: 35.1, w: 15.4, h: 42.1 },
    media: { x: 0, y: 65.9, w: 27.7, h: 30.4 },
  },
  sources: [],
  tts: { provider: 'google', voice: 'ru', volume: 100, showText: false },
};

function seedConfigIfNeeded() {
  if (!app.isPackaged) return;
  try {
    if (!fs.existsSync(dataPath('config.json'))) {
      fs.writeFileSync(dataPath('config.json'), JSON.stringify(CLEAN_CONFIG, null, 2));
    }
  } catch {}
}

/* Справка открывается только при самом первом запуске.
   Дальше — по кнопке «?» в шапке или по F1. */
function helpShownBefore() {
  try {
    return fs.existsSync(dataPath('help-shown'));
  } catch {
    return true;
  }
}

function markHelpShown() {
  try {
    fs.writeFileSync(dataPath('help-shown'), new Date().toISOString());
  } catch {}
}

function readToken() {
  if (process.env.CONTROL_TOKEN) return process.env.CONTROL_TOKEN;
  try {
    const raw = fs.readFileSync(dataPath('.token'), 'utf8').trim();
    try {
      const j = JSON.parse(raw);
      if (j.token) return j.token;
    } catch {}
    if (raw) return raw;
  } catch {}
  return '';
}

function waitServer(msTimeout = 20000) {
  return new Promise((resolve) => {
    const started = Date.now();
    const timer = setInterval(async () => {
      let up = false;
      try {
        const res = await fetch(`http://127.0.0.1:${port}/healthz`);
        up = res.status === 200 || res.status === 503;
      } catch {}
      if (up || Date.now() - started > msTimeout) {
        clearInterval(timer);
        resolve(up);
      }
    }, 200);
  });
}

async function portBusy() {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/healthz`);
    return res.status === 200 || res.status === 503;
  } catch {
    return false;
  }
}

function openHelpWindow() {
  if (helpWin && !helpWin.isDestroyed()) {
    helpWin.show();
    helpWin.focus();
    return;
  }  helpWin = new BrowserWindow({
    width: 600,
    height: 700,
    title: 'Справка — что куда вставлять',
    autoHideMenuBar: true,
    backgroundColor: '#14141b',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  helpWin.loadURL(`http://127.0.0.1:${port}/help`);
  helpWin.on('closed', () => { helpWin = null; });
}

function createPanelWindow(url) {
  panelWin = new BrowserWindow({
    width: 1440,
    height: 1000,
    title: 'Overlay Control',
    autoHideMenuBar: true,
    backgroundColor: '#14141b',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  panelWin.webContents.setWindowOpenHandler(({ url: target }) => {
    const isLocalHelp = /^https?:\/\/127\.0\.0\.1:\d+\/help(\?|$)/.test(target)
      || /^https?:\/\/localhost:\d+\/help(\?|$)/.test(target);
    if (isLocalHelp) {
      openHelpWindow();
      return { action: 'deny' };
    }
    return { action: 'deny' };
  });

  panelWin.loadURL(url);
  panelWin.on('closed', () => { panelWin = null; });
}

function buildMenu() {
  const isMac = process.platform === 'darwin';
  const template = [
    ...(isMac ? [{ role: 'appMenu' }] : []),
    {
      label: 'Открыть',
      submenu: [
        {
          label: 'Справка (что куда вставлять)',
          accelerator: 'F1',
          click: () => openHelpWindow(),
        },
        { type: 'separator' },
        {
          label: 'Перезагрузить панель',
          accelerator: 'CmdOrCtrl+R',
          click: () => { if (panelWin && !panelWin.isDestroyed()) panelWin.webContents.reload(); },
        },
        {
          label: 'Выход',
          accelerator: isMac ? 'Cmd+Q' : 'Ctrl+Q',
          click: () => app.quit(),
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.whenReady().then(async () => {
  seedConfigIfNeeded();
  process.env.OVERLAY_DATA_DIR = dataDir();
  const cfg = readJson(dataPath('config.json'), readJson(CONFIG_FILE, {}));
  port = Number(cfg.port) || 3000;

  // Если веб-версия уже запущена и держит порт — присоединяемся к ней,
  // свой сервер не поднимаем (иначе после 30 с ретраев сервер уйдёт в exit).
  const alreadyUp = await portBusy();
  if (!alreadyUp) {
    require(path.join(ROOT, 'server.js'));
  }

  buildMenu();

  const up = await waitServer();
  if (!up) {
    console.error('[desktop] Сервер не поднялся, выходим. Порт занят?');
    app.quit();
    return;
  }

  const token = readToken();
  const query = token ? '?t=' + encodeURIComponent(token) : '';
  createPanelWindow(`http://127.0.0.1:${port}/control${query}`);

  if (!process.argv.includes('--smoke') && !helpShownBefore()) {
    markHelpShown();
    openHelpWindow();
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createPanelWindow(`http://127.0.0.1:${port}/control?t=` + encodeURIComponent(readToken()));
    }
  });
});

app.on('window-all-closed', () => {
  app.quit();
});

if (app.isPackaged && fs.existsSync(path.join(process.resourcesPath, 'app-update.yml'))) {
  try {
    const { autoUpdater } = require('electron-updater');
    autoUpdater.autoDownload = false;
    autoUpdater.on('update-available', (info) => {
      console.log('[desktop] доступно обновление:', info.version);
    });
    autoUpdater.on('error', (e) => {
      console.log('[desktop] проверка обновлений:', e && e.message);
    });
    autoUpdater.checkForUpdates().catch(() => {});
  } catch {}
}

if (process.argv.includes('--smoke')) {
  app.whenReady().then(() => {
    let done = false;
    const poll = setInterval(() => {
      if (done || !panelWin || panelWin.isDestroyed()) return;
      panelWin.webContents.executeJavaScript('document.getElementById("gate") ? document.getElementById("gate").classList.contains("hidden") : false')
        .then((connected) => {
          if (connected) {
            done = true;
            clearInterval(poll);
            console.log('[desktop] SMOKE panel=', panelWin.webContents.getTitle(),
              '| url=', panelWin.webContents.getURL());
            app.exit(0);
          }
        }).catch(() => {});
    }, 300);
    setTimeout(() => { console.log('[desktop] SMOKE TIMEOUT'); app.exit(2); }, 30000);
  });
}