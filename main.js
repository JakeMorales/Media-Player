const { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, screen, session, desktopCapturer } = require('electron');
const path = require('path');
const fs = require('fs');
const { getActiveSessions, getAllSessions, onSessionsChanged, shutdown } = require('windows-media-sessions');
const { getSystemVolume, setSystemVolume } = require('./src/main/volume-ps');
const { handleMediaControl } = require('./src/main/media-control-ps');
const statsStore = require('./src/main/stats-store');


let win, tray;
let stopSessions = null;
let lastMediaKey = '';
let latestMeta = null;
let widgetInteractive = false;
const isDev = process.argv.includes('--dev');

function applyMouseMode() {
  if (!win || win.isDestroyed()) return;
  win.setIgnoreMouseEvents(!widgetInteractive, { forward: !widgetInteractive });
}

function pickSession(sessions) {
  if (!sessions || !sessions.length) return null;
  return sessions.find((s) => s.playbackStatus === 'playing')
    || sessions.find((s) => s.playbackStatus === 'paused')
    || sessions.find((s) => s.title || s.artist)
    || sessions[0];
}

function sendMeta(sessionData) {
  if (!win || win.isDestroyed()) return;

  if (!sessionData) {
    latestMeta = null;
    if (lastMediaKey !== '') {
      lastMediaKey = '';
      win.webContents.send('media-meta', null);
    }
    return;
  }

  const timeline = sessionData.timelineProperties || sessionData.timeline || {};
  const rawDuration = sessionData.endTimeMs ?? sessionData.durationMs ?? sessionData.duration ?? timeline.durationMs ?? timeline.duration;
  const rawPosition = sessionData.positionMs ?? sessionData.position ?? timeline.positionMs ?? timeline.position;
  const durationMs = Number.isFinite(Number(rawDuration)) ? Math.max(0, Number(rawDuration)) : 0;
  const positionMs = Number.isFinite(Number(rawPosition)) ? Math.max(0, Number(rawPosition)) : 0;

  const meta = {
    appId: sessionData.sourceAppUserModelId || '',
    title: sessionData.title || '',
    artist: sessionData.artist || '',
    album: sessionData.albumTitle || '',
    artwork: sessionData.thumbnail || '',
    playbackStatus: sessionData.playbackStatus || 'paused',
    durationMs,
    positionMs,
    controls: {
      canPlay: sessionData.controls ? sessionData.controls.canPlay !== false : true,
      canPause: sessionData.controls ? sessionData.controls.canPause !== false : true,
      canSkipNext: sessionData.controls ? sessionData.controls.canSkipNext !== false : true,
      canSkipPrevious: sessionData.controls ? sessionData.controls.canSkipPrevious !== false : true
    }
  };
  latestMeta = meta;

  const key = `${meta.appId}|${meta.artist}|${meta.title}|${(meta.artwork || '').length}`;
  if (key !== lastMediaKey) {
    lastMediaKey = key;
    console.log(`[media] ${meta.artist || 'Unknown'} - ${meta.title || 'Unknown'} (${meta.appId || 'app'})`);
    win.webContents.send('media-meta', meta);
  }
}

function startMediaBroadcast() {
  if (process.platform !== 'win32') return;

  const onSessions = (sessions) => {
    sendMeta(pickSession(sessions));
  };

  stopSessions = onSessionsChanged(onSessions);

  Promise.allSettled([getActiveSessions(), getAllSessions()]).then(([activeRes, allRes]) => {
    const active = activeRes.status === 'fulfilled' ? activeRes.value : [];
    if (active && active.length) {
      onSessions(active);
      return;
    }
    const all = allRes.status === 'fulfilled' ? allRes.value : [];
    onSessions(all);
  }).catch(() => {
    sendMeta(null);
  });
}

function createTray() {
  const iconPath = path.join(__dirname, 'assets', 'icon.png');
  let icon;
  if (fs.existsSync(iconPath)) {
    icon = nativeImage.createFromPath(iconPath);
  } else {
    // Minimal 1Ã—1 fallback PNG â€” replace assets/icon.png with a real 32Ã—32 icon
    const b64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
    icon = nativeImage.createFromDataURL(`data:image/png;base64,${b64}`);
  }

  tray = new Tray(icon);
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Show', click: () => win.show() },
    { label: 'Hide', click: () => win.hide() },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() }
  ]));
  tray.setToolTip('Audio Visualizer');
}

function createWindow() {
  const { bounds } = screen.getPrimaryDisplay();

  win = new BrowserWindow({
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    transparent: true,
    frame: false,
    resizable: false,
    movable: false,
    skipTaskbar: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    }
  });

  win.loadFile(path.join(__dirname, 'src', 'index.html'));

  if (isDev) {
    win.webContents.openDevTools({ mode: 'detach' });
    let reloadTimer;
    fs.watch(path.join(__dirname, 'src'), { recursive: true }, () => {
      clearTimeout(reloadTimer);
      reloadTimer = setTimeout(() => win.webContents.reload(), 150);
    });
  }
}

// Renderer signals audio is running â†’ make window fully click-through
ipcMain.on('audio-started', () => {
  applyMouseMode();
});

ipcMain.on('overlay:hover-widget', (_, interactive) => {
  widgetInteractive = !!interactive;
  applyMouseMode();
});

ipcMain.handle('media-meta:get', () => latestMeta);

// --- Stats persistence ---------------------------------------------------
// Renderer session-tracker sends ListeningSample objects here; they are
// stored on disk under userData/listening-samples.json. A separate IPC
// endpoint exposes the full history back to the renderer so identity /
// streak UI can span app restarts.
ipcMain.handle('stats:append-samples', async (_event, samples) => {
  try {
    if (Array.isArray(samples) && samples.length) {
      statsStore.appendSamples(samples);
    }
  } catch (_) {
    // Stats persistence is best-effort; never throw back to renderer.
  }
  return true;
});

ipcMain.handle('stats:get-samples', () => {
  try {
    return statsStore.getAllSamples();
  } catch (_) {
    return [];
  }
});

ipcMain.handle('system-volume:get', async () => getSystemVolume());
ipcMain.handle('system-volume:set', async (_, level) => setSystemVolume(level));
ipcMain.handle('media-control', async (_, action) => handleMediaControl(action));
ipcMain.handle('settings:launch-on-start:get', () => {

  try {
    return app.getLoginItemSettings().openAtLogin;
  } catch {
    return false;
  }
});
ipcMain.handle('settings:launch-on-start:set', (_, enabled) => {
  try {
    app.setLoginItemSettings({ openAtLogin: !!enabled });
    return true;
  } catch {
    return false;
  }
});
ipcMain.handle('app:close', () => {
  setImmediate(() => app.quit());
  return true;
});

app.whenReady().then(() => {
  session.defaultSession.setDisplayMediaRequestHandler((_, callback) => {
    desktopCapturer.getSources({ types: ['screen'] }).then((sources) => {
      callback({ video: sources[0], audio: 'loopback' });
    }).catch(() => {
      callback({ video: null, audio: null });
    });
  }, { useSystemPicker: false });

  createWindow();
  createTray();
  startMediaBroadcast();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  if (stopSessions) {
    stopSessions();
    stopSessions = null;
  }
  shutdown().catch(() => {});
});
