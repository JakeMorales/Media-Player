'use strict';

// identity-panel.js — Phase 2 identity primitives (data only UI):
// - Today's listening summary
// - Basic listening streak indicator
//
// This module reads from stats/runtime-store and updates lightweight identity
// UI surfaces (e.g. the side tab + streak badge). It is entirely optional; if
// any call fails, it quietly falls back to placeholder text without affecting
// playback or visuals.

const statsStore = require('./stats/runtime-store');

let _ipcRenderer = null;
const _els = {
  todaySummaryEl: null,
  streakValueEl: null,
  streakSubtitleEl: null,
  streakBadgeEl: null
};
let _intervalId = null;

function _plural(n, unit) {
  return `${n} ${unit}${n === 1 ? '' : 's'}`;
}

function _updateToday(today) {
  const el = _els.todaySummaryEl;
  if (!el) return;

  if (!today || !today.totalMs) {
    el.textContent = 'No listening yet today';
    return;
  }

  const mins = Math.round(today.totalMs / 60000);
  const artists = today.uniqueArtists || 0;
  const sources = Object.keys(today.bySourceMs || {}).length;
  const parts = [];

  parts.push(_plural(mins, 'min'));
  if (artists > 0) parts.push(_plural(artists, 'artist'));
  if (sources > 0) parts.push(_plural(sources, 'source'));

  el.textContent = parts.join(' · ');
}

function _updateStreak(snapshots) {
  const valueEl = _els.streakValueEl;
  const subEl   = _els.streakSubtitleEl;
  const badgeEl = _els.streakBadgeEl;
  if (!valueEl && !badgeEl) return;

  if (!Array.isArray(snapshots) || snapshots.length === 0) {
    if (valueEl) valueEl.textContent = '0 days';
    if (badgeEl) badgeEl.textContent = '0 days';
    if (subEl) subEl.textContent = 'No streak yet';
    return;
  }

  const sorted = snapshots.slice().sort((a, b) => a.dateKey.localeCompare(b.dateKey));
  let streak = 0;
  for (let i = sorted.length - 1; i >= 0; i--) {
    if (!sorted[i].isStreakEligible) break;
    streak += 1;
  }

  const label = _plural(streak, 'day');
  if (valueEl) valueEl.textContent = label;
  if (badgeEl) badgeEl.textContent = label;
  if (subEl) {
    subEl.textContent = streak > 0 ? 'Current listening streak' : 'No streak yet';
  }
}

async function _refresh() {
  if (!_ipcRenderer) return;
  try {
    await statsStore.refreshDailySnapshots(_ipcRenderer);
    const today = statsStore.getTodaySnapshotUtc();
    const all   = statsStore.getDailySnapshots();
    _updateToday(today);
    _updateStreak(all);
  } catch (_) {
    // Identity UI is best-effort; ignore errors.
  }
}

function init({ ipcRenderer, elements }) {
  _ipcRenderer = ipcRenderer || null;
  _els.todaySummaryEl   = elements.todaySummaryEl   || null;
  _els.streakValueEl    = elements.streakValueEl    || null;
  _els.streakSubtitleEl = elements.streakSubtitleEl || null;
  _els.streakBadgeEl    = elements.streakBadgeEl    || null;

  if (!_ipcRenderer) return;

  // Initial refresh
  _refresh();

  if (typeof window !== 'undefined') {
    window.addEventListener('focus', _refresh);
    _intervalId = window.setInterval(_refresh, 5 * 60 * 1000); // every 5 min
  }
}

module.exports = {
  init,
  refresh: _refresh
};
