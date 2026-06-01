'use strict';

// ---------------------------------------------------------------------------
// Media transport control via GSMTC (GlobalSystemMediaTransportControls) with
// a virtual-key fallback for apps that don't expose a GSMTC session.
// ---------------------------------------------------------------------------

const { runPowerShell } = require('./volume-ps');

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
    previous:  '$null = Wait-Async($session.TrySkipPreviousAsync())',
    next:      '$null = Wait-Async($session.TrySkipNextAsync())',
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
  const vkByAction = { previous: 0xB1, next: 0xB0, playpause: 0xB3 };
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

// Try GSMTC first; fall back to virtual media key.
async function handleMediaControl(action) {
  const directOk = await runMediaControl(action);
  if (directOk) return true;
  return sendMediaKey(action);
}

module.exports = { handleMediaControl };
