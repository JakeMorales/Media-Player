const { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, screen, session, desktopCapturer } = require('electron');
const path = require('path');
const fs = require('fs');
const { execFile } = require('child_process');
const { getActiveSessions, getAllSessions, onSessionsChanged, shutdown } = require('windows-media-sessions');

let win, tray;
let stopSessions = null;
let lastMediaKey = '';
let latestMeta = null;
let widgetInteractive = false;
const isDev = process.argv.includes('--dev');

const AUDIO_PS_HELPER = `
Add-Type -TypeDefinition @"
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;

[Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioEndpointVolume {
  int RegisterControlChangeNotify(IntPtr pNotify);
  int UnregisterControlChangeNotify(IntPtr pNotify);
  int GetChannelCount(out uint pnChannelCount);
  int SetMasterVolumeLevel(float fLevelDB, Guid pguidEventContext);
  int SetMasterVolumeLevelScalar(float fLevel, Guid pguidEventContext);
  int GetMasterVolumeLevel(out float pfLevelDB);
  int GetMasterVolumeLevelScalar(out float pfLevel);
  int SetChannelVolumeLevel(uint nChannel, float fLevelDB, Guid pguidEventContext);
  int SetChannelVolumeLevelScalar(uint nChannel, float fLevel, Guid pguidEventContext);
  int GetChannelVolumeLevel(uint nChannel, out float pfLevelDB);
  int GetChannelVolumeLevelScalar(uint nChannel, out float pfLevel);
  int SetMute([MarshalAs(UnmanagedType.Bool)] bool bMute, Guid pguidEventContext);
  int GetMute(out bool pbMute);
  int GetVolumeStepInfo(out uint pnStep, out uint pnStepCount);
  int VolumeStepUp(Guid pguidEventContext);
  int VolumeStepDown(Guid pguidEventContext);
  int QueryHardwareSupport(out uint pdwHardwareSupportMask);
  int GetVolumeRange(out float pflVolumeMindB, out float pflVolumeMaxdB, out float pflVolumeIncrementdB);
}

[Guid("87CE5498-68D6-44E5-9215-6DA47EF883D8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface ISimpleAudioVolume {
  int SetMasterVolume(float fLevel, Guid EventContext);
  int GetMasterVolume(out float pfLevel);
  int SetMute([MarshalAs(UnmanagedType.Bool)] bool bMute, Guid EventContext);
  int GetMute(out bool pbMute);
}

[Guid("F4B1A599-7266-4319-A8CA-E70ACB11E8CD"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioSessionControl {
  int GetState(out int pRetVal);
  int GetDisplayName([MarshalAs(UnmanagedType.LPWStr)] out string pRetVal);
  int SetDisplayName([MarshalAs(UnmanagedType.LPWStr)] string Value, Guid EventContext);
  int GetIconPath([MarshalAs(UnmanagedType.LPWStr)] out string pRetVal);
  int SetIconPath([MarshalAs(UnmanagedType.LPWStr)] string Value, Guid EventContext);
  int GetGroupingParam(out Guid pRetVal);
  int SetGroupingParam(Guid Override, Guid EventContext);
  int RegisterAudioSessionNotification(IntPtr NewNotifications);
  int UnregisterAudioSessionNotification(IntPtr NewNotifications);
}

[Guid("E2F5BB11-0570-40CA-ACDD-3AA01277DEE8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioSessionEnumerator {
  int GetCount(out int SessionCount);
  int GetSession(int SessionCount, out IAudioSessionControl Session);
}

[Guid("77AA99A0-1BD6-484F-8BC7-2C654C9A9B6F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioSessionManager2 {
  int GetAudioSessionControl(ref Guid AudioSessionGuid, uint StreamFlags, out IAudioSessionControl SessionControl);
  int GetSimpleAudioVolume(ref Guid AudioSessionGuid, uint StreamFlags, out ISimpleAudioVolume AudioVolume);
  int GetSessionEnumerator(out IAudioSessionEnumerator SessionEnum);
  int RegisterSessionNotification(IntPtr SessionNotification);
  int UnregisterSessionNotification(IntPtr SessionNotification);
  int RegisterDuckNotification([MarshalAs(UnmanagedType.LPWStr)] string sessionID, IntPtr duckNotification);
  int UnregisterDuckNotification(IntPtr duckNotification);
}

[Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDevice {
  int Activate(ref Guid iid, int dwClsCtx, IntPtr pActivationParams, [MarshalAs(UnmanagedType.Interface)] out object ppInterface);
  int OpenPropertyStore(int stgmAccess, [MarshalAs(UnmanagedType.Interface)] out object ppProperties);
  int GetId([MarshalAs(UnmanagedType.LPWStr)] out string ppstrId);
  int GetState(out int pdwState);
}

[Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDeviceEnumerator {
  int NotImpl1();
  int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice ppDevice);
  int GetDevice(string pwstrId, out IMMDevice ppDevice);
  int RegisterEndpointNotificationCallback(IntPtr pClient);
  int UnregisterEndpointNotificationCallback(IntPtr pClient);
  int EnumAudioEndpoints(int dataFlow, int dwStateMask, out IMMDeviceCollection ppDevices);
}

[Guid("0BD7A1BE-7A1A-44DB-8397-C0A6542B5CC8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDeviceCollection {
  int GetCount(out uint pcDevices);
  int Item(uint nDevice, out IMMDevice ppDevice);
}

[ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")]
class MMDeviceEnumeratorComObject {}

public static class Audio {
  const int ERender = 0;
  const int DEVICE_STATE_ACTIVE = 0x1;

  static IAudioEndpointVolume GetEndpointVolume(IMMDevice device) {
    Guid iid = typeof(IAudioEndpointVolume).GUID;
    object obj;
    Marshal.ThrowExceptionForHR(device.Activate(ref iid, 23, IntPtr.Zero, out obj));
    return (IAudioEndpointVolume)obj;
  }

  static List<IMMDevice> ResolveTargetRenderDevices() {
    var targets = new List<IMMDevice>();
    var enumerator = (IMMDeviceEnumerator)(new MMDeviceEnumeratorComObject());

    // Generic strategy: use all default render roles (Console, Multimedia, Communications).
    var ids = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
    for (int role = 0; role <= 2; role++) {
      IMMDevice d;
      Marshal.ThrowExceptionForHR(enumerator.GetDefaultAudioEndpoint(ERender, role, out d));
      string id;
      Marshal.ThrowExceptionForHR(d.GetId(out id));
      if (ids.Add(id)) {
        targets.Add(d);
      }
    }

    return targets;
  }

  static List<IMMDevice> ResolveAllActiveRenderDevices() {
    var targets = new List<IMMDevice>();
    var enumerator = (IMMDeviceEnumerator)(new MMDeviceEnumeratorComObject());
    IMMDeviceCollection collection;
    Marshal.ThrowExceptionForHR(enumerator.EnumAudioEndpoints(ERender, DEVICE_STATE_ACTIVE, out collection));
    uint count;
    Marshal.ThrowExceptionForHR(collection.GetCount(out count));
    for (uint i = 0; i < count; i++) {
      IMMDevice d;
      Marshal.ThrowExceptionForHR(collection.Item(i, out d));
      targets.Add(d);
    }
    return targets;
  }

  static float GetAverageVolume(List<IMMDevice> devices) {
    if (devices.Count == 0) return 0.5f;
    float sum = 0f;
    int n = 0;
    foreach (var d in devices) {
      try {
        float level;
        bool muted;
        var epv = GetEndpointVolume(d);
        Marshal.ThrowExceptionForHR(epv.GetMute(out muted));
        Marshal.ThrowExceptionForHR(epv.GetMasterVolumeLevelScalar(out level));
        if (muted) level = 0f;
        sum += level;
        n++;
      } catch {
        // Skip unsupported/invalid endpoints.
      }
    }
    return n > 0 ? (sum / n) : 0.5f;
  }

  static void SetVolumeOnDevices(List<IMMDevice> devices, float level) {
    foreach (var d in devices) {
      try {
        var epv = GetEndpointVolume(d);
        Marshal.ThrowExceptionForHR(epv.SetMute(level <= 0f, Guid.Empty));
        Marshal.ThrowExceptionForHR(epv.SetMasterVolumeLevelScalar(level, Guid.Empty));
        SetSessionVolumesOnDevice(d, level);
      } catch {
        // Skip unsupported/invalid endpoints.
      }
    }
  }

  static void SetSessionVolumesOnDevice(IMMDevice device, float level) {
    try {
      Guid iid = typeof(IAudioSessionManager2).GUID;
      object obj;
      Marshal.ThrowExceptionForHR(device.Activate(ref iid, 23, IntPtr.Zero, out obj));
      var mgr = (IAudioSessionManager2)obj;
      IAudioSessionEnumerator sessions;
      Marshal.ThrowExceptionForHR(mgr.GetSessionEnumerator(out sessions));
      int count;
      Marshal.ThrowExceptionForHR(sessions.GetCount(out count));

      for (int i = 0; i < count; i++) {
        IAudioSessionControl ctrl;
        if (sessions.GetSession(i, out ctrl) != 0 || ctrl == null) continue;
        var simple = ctrl as ISimpleAudioVolume;
        if (simple == null) continue;
        simple.SetMute(level <= 0f, Guid.Empty);
        simple.SetMasterVolume(level, Guid.Empty);
      }
    } catch {
      // Ignore per-session failures; endpoint volume still applies.
    }
  }

  public static float GetMasterVolume() {
    return GetAverageVolume(ResolveTargetRenderDevices());
  }

  public static void SetMasterVolume(float level) {
    if (level < 0f) level = 0f;
    if (level > 1f) level = 1f;

    var primary = ResolveTargetRenderDevices();
    if (primary.Count > 0) {
      SetVolumeOnDevices(primary, level);
    }

    // Generic fallback: also apply to all active render endpoints for virtual mixer stacks.
    var allActive = ResolveAllActiveRenderDevices();
    if (allActive.Count > 0) {
      SetVolumeOnDevices(allActive, level);
    }
  }
}
"@
`;

function runPowerShell(script) {
  return new Promise((resolve, reject) => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script], { windowsHide: true }, (err, stdout, stderr) => {
      if (err) {
        reject(new Error((stderr || err.message || 'PowerShell failed').trim()));
        return;
      }
      resolve((stdout || '').trim());
    });
  });
}

async function getSystemVolume() {
  try {
    const out = await runPowerShell(`${AUDIO_PS_HELPER}\n[Audio]::GetMasterVolume()`);
    const v = Number.parseFloat(out);
    if (!Number.isFinite(v)) return 0.5;
    return Math.min(1, Math.max(0, v));
  } catch {
    return 0.5;
  }
}

async function setSystemVolume(level) {
  const n = Math.min(1, Math.max(0, Number(level) || 0));
  const out = await runPowerShell(`${AUDIO_PS_HELPER}\n[Audio]::SetMasterVolume(${n.toFixed(4)}); [Audio]::GetMasterVolume()`);
  const v = Number.parseFloat(out);
  if (!Number.isFinite(v)) return n;
  return Math.min(1, Math.max(0, v));
}

const MEDIA_CONTROL_PS_HELPER = `
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType=WindowsRuntime]
$null = [Windows.Foundation.IAsyncOperation\`1, Windows.Foundation, ContentType=WindowsRuntime]
function Wait-Async([object]$op) {
  while ($op.Status -eq [Windows.Foundation.AsyncStatus]::Started) {
    [System.Threading.Thread]::Sleep(10)
  }
  if ($op.Status -ne [Windows.Foundation.AsyncStatus]::Completed) { return $null }
  return $op.GetResults()
}
`;

async function runMediaControl(action) {
  const commandMap = {
    previous: '$null = Wait-Async($session.TrySkipPreviousAsync())',
    next: '$null = Wait-Async($session.TrySkipNextAsync())',
    playpause: '$null = Wait-Async($session.TryTogglePlayPauseAsync())'
  };

  const command = commandMap[action];
  if (!command) return false;

  const script = `${MEDIA_CONTROL_PS_HELPER}
$manager = Wait-Async([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync())
if (-not $manager) { '0'; exit 0 }
$session = $manager.GetCurrentSession()
if (-not $session) {
  $sessions = $manager.GetSessions()
  if ($sessions -and $sessions.Count -gt 0) {
    foreach ($s in $sessions) {
      if ($s.GetPlaybackInfo().PlaybackStatus -eq [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionPlaybackStatus]::Playing) { $session = $s; break }
    }
    if (-not $session) { $session = $sessions[0] }
  }
}
if (-not $session) { '0'; exit 0 }
${command}
'1'`;

  try {
    const out = await runPowerShell(script);
    return out.trim().endsWith('1');
  } catch {
    return false;
  }
}

async function sendMediaKey(action) {
  const vkByAction = {
    previous: 0xB1,
    next: 0xB0,
    playpause: 0xB3
  };

  const vk = vkByAction[action];
  if (!vk) return false;

  const script = `
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public static class Keys {
  [DllImport("user32.dll", SetLastError=true)]
  public static extern void keybd_event(byte bVk, byte bScan, int dwFlags, int dwExtraInfo);
}
"@
$vk = ${vk}
[Keys]::keybd_event([byte]$vk, 0, 0, 0)
[Keys]::keybd_event([byte]$vk, 0, 2, 0)
'1'`;

  try {
    const out = await runPowerShell(script);
    return out.trim().endsWith('1');
  } catch {
    return false;
  }
}

async function handleMediaControl(action) {
  // First try direct GSMTC session control, then fall back to global media key.
  const directOk = await runMediaControl(action);
  if (directOk) return true;
  return sendMediaKey(action);
}

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

  const meta = {
    appId: sessionData.sourceAppUserModelId || '',
    title: sessionData.title || '',
    artist: sessionData.artist || '',
    album: sessionData.albumTitle || '',
    artwork: sessionData.thumbnail || '',
    playbackStatus: sessionData.playbackStatus || 'paused',
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
    // Minimal 1×1 fallback PNG — replace assets/icon.png with a real 32×32 icon
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

// Renderer signals audio is running → make window fully click-through
ipcMain.on('audio-started', () => {
  applyMouseMode();
});

ipcMain.on('overlay:hover-widget', (_, interactive) => {
  widgetInteractive = !!interactive;
  applyMouseMode();
});

ipcMain.handle('media-meta:get', () => latestMeta);
ipcMain.handle('system-volume:get', async () => getSystemVolume());
ipcMain.handle('system-volume:set', async (_, level) => setSystemVolume(level));
ipcMain.handle('media-control', async (_, action) => handleMediaControl(action));

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
