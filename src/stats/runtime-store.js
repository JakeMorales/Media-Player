'use strict';

// runtime-store.js — In-memory view of listening data for Phase 2.
//
// This module stitches together the session tracker (ListeningSample events)
// and the pure aggregator helpers to expose ready-to-consume daily snapshots
// for any future UI or export features.
//
// Persistence note:
// - Raw ListeningSample events are mirrored to the main process via
//   `stats:append-samples` (see session-tracker.js and main/stats-store.js).
// - On first refresh we hydrate the in-memory buffer from
//   `stats:get-samples` so that daily snapshots and streaks span app
//   restarts.

const sessionTracker = require('./session-tracker');
const { buildDailySnapshots } = require('./aggregator');

let _dailySnapshots = [];
let _lastRefreshedAt = 0;
let _hydratedFromDisk = false;

async function _ensureHydrated(ipcRenderer) {
  if (_hydratedFromDisk) return;

  // Hydration is best-effort: if IPC fails we simply continue with the
  // in-memory samples captured since this process started.
  if (!ipcRenderer || typeof ipcRenderer.invoke !== 'function') {
    _hydratedFromDisk = true;
    return;
  }

  try {
    const persisted = await ipcRenderer.invoke('stats:get-samples');
    if (Array.isArray(persisted) && persisted.length &&
        typeof sessionTracker.preloadSamples === 'function') {
      sessionTracker.preloadSamples(persisted);
    }
  } catch (_) {
    // Ignore; stats are non-critical.
  } finally {
    _hydratedFromDisk = true;
  }
}

// Recompute daily snapshots from the current in-memory sample buffer.
// Returns the new snapshots array.
async function refreshDailySnapshots(ipcRenderer) {
  await _ensureHydrated(ipcRenderer);
  const samples = sessionTracker.getRecentSamples();
  _dailySnapshots = buildDailySnapshots(samples);
  _lastRefreshedAt = Date.now();
  return _dailySnapshots;
}

// Retrieve the last computed daily snapshots. Call refreshDailySnapshots()
// first to ensure they are up-to-date.
function getDailySnapshots() {
  return _dailySnapshots.slice();
}

// Convenience helper: find the snapshot for a specific UTC dateKey
// (YYYY-MM-DD), if present.
function getSnapshotForDate(dateKey) {
  return _dailySnapshots.find(snap => snap.dateKey === dateKey) || null;
}

// Convenience helper: get today's UTC snapshot if present.
function getTodaySnapshotUtc() {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  const d = String(now.getUTCDate()).padStart(2, '0');
  const key = `${y}-${m}-${d}`;
  return getSnapshotForDate(key);
}

function getLastRefreshedAt() {
  return _lastRefreshedAt;
}

module.exports = {
  refreshDailySnapshots,
  getDailySnapshots,
  getSnapshotForDate,
  getTodaySnapshotUtc,
  getLastRefreshedAt
};
