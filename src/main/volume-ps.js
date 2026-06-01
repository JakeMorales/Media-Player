'use strict';

// ---------------------------------------------------------------------------
// Windows system-volume control via PowerShell + COM / Core Audio.
// The large C# type definition is inlined here so main.js stays readable.
// ---------------------------------------------------------------------------

const { execFile } = require('child_process');

// ---------------------------------------------------------------------------
// Inline C# — COM interop for IAudioEndpointVolume / IAudioSessionManager2
// ---------------------------------------------------------------------------
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
    var ids = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
    for (int role = 0; role <= 2; role++) {
      IMMDevice d;
      Marshal.ThrowExceptionForHR(enumerator.GetDefaultAudioEndpoint(ERender, role, out d));
      string id;
      Marshal.ThrowExceptionForHR(d.GetId(out id));
      if (ids.Add(id)) targets.Add(d);
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
    if (primary.Count > 0) SetVolumeOnDevices(primary, level);
    // Fallback: apply to all active render endpoints for virtual mixer stacks.
    var allActive = ResolveAllActiveRenderDevices();
    if (allActive.Count > 0) SetVolumeOnDevices(allActive, level);
  }
}
"@
`;

function runPowerShell(script) {
  return new Promise((resolve, reject) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
      { windowsHide: true },
      (err, stdout, stderr) => {
        if (err) { reject(new Error((stderr || err.message || 'PowerShell failed').trim())); return; }
        resolve((stdout || '').trim());
      }
    );
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
  const out = await runPowerShell(
    `${AUDIO_PS_HELPER}\n[Audio]::SetMasterVolume(${n.toFixed(4)}); [Audio]::GetMasterVolume()`
  );
  const v = Number.parseFloat(out);
  if (!Number.isFinite(v)) return n;
  return Math.min(1, Math.max(0, v));
}

module.exports = { runPowerShell, getSystemVolume, setSystemVolume };
