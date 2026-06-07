'use strict';

// session-tracker.js — Passive listening session capture from metadata.
//
// This module lives entirely in the renderer. It listens to metadata changes
// (via player.js → onMetadataChanged) and builds an in-memory buffer of
// ListeningSample objects. A bounded history is exposed via getRecentSamples()
// and optionally mirrored to the main-process stats-store over IPC.

const { ipcRenderer } = require('electron');
const { createTrackRef, createListeningSample } = require('../models/listening-stats');

const MAX_RECENT_SAMPLES = 5000;
const MIN_SESSION_MS = 5000; // ignore extremely short blips (<5s)

let _samples = [];
let _activeSession = null; // { trackKey, trackRef, startedAt }

function _inferSourceId(appId) {
  const id = (appId || '').toLowerCase();
  if (id.includes('spotify')) return 'spotify';
  if (id.includes('applemusic') || id.includes('itunes') || id.includes('apple music')) return 'apple';
  if (id.includes('youtube') || id.includes('ytmusic')) return 'youtube';
  if (id.includes('chrome') || id.includes('msedge') || id.includes('firefox') || id.includes('opera') || id.includes('brave')) return 'browser';
  return 'unknown';
}

function _closeActiveSession(now, playbackProgressState) {
  if (!_activeSession) return;

  const startedAt = _activeSession.startedAt;
  const endedAt = now || Date.now();
  const rawDuration = Math.max(0, endedAt - startedAt);
  if (rawDuration < MIN_SESSION_MS) {
    _activeSession = null;
    return;
  }

  let progressPct;
  if (playbackProgressState && playbackProgressState.durationMs > 0) {
    const pos = Math.max(0, playbackProgressState.positionMs || 0);
    const dur = Math.max(1, playbackProgressState.durationMs || 1);
    progressPct = Math.min(1, pos / dur);
  }

  const sample = createListeningSample({
    track: _activeSession.trackRef,
    startedAt,
    endedAt,
    progressPct
  });

  _samples.push(sample);
  if (_samples.length > MAX_RECENT_SAMPLES) {
    _samples = _samples.slice(_samples.length - MAX_RECENT_SAMPLES);
  }

  // Best-effort persistence to main-process store.
  try {
    ipcRenderer.invoke('stats:append-samples', [sample]).catch(() => {});
  } catch (_) {
    // IPC failures are non-fatal for stats.
  }

  _activeSession = null;
}

function _startSession(now, meta, trackKey, playbackProgressState) {
  const trackRef = createTrackRef({
    id: (playbackProgressState && playbackProgressState.trackKey) || trackKey || undefined,
    title: meta.title,
    artist: meta.artist,
    album: meta.album,
    sourceId: _inferSourceId(meta.appId)
  });

  _activeSession = {
    trackKey,
    trackRef,
    startedAt: now || Date.now()
  };
}

// payload: {
//   prevTrackKey: string,
//   prevStatus: string,
//   meta: { appId, title, artist, album, playbackStatus, ... },
//   playbackProgressState: { durationMs, positionMs, playing, trackKey, lastTickMs }
// }
function onMetadataChanged(payload) {
  if (!payload || !payload.meta) return;

  const { prevTrackKey, prevStatus, meta, playbackProgressState } = payload;
  const now = Date.now();

  const newStatus = (meta.playbackStatus || 'paused').toLowerCase();
  const newTrackKey = `${meta.appId || ''}|${meta.title || ''}|${meta.artist || ''}`;

  const hadSession = !!_activeSession;
  const trackChanged = hadSession && _activeSession.trackKey && _activeSession.trackKey !== newTrackKey;
  const statusStopped = prevStatus === 'playing' && newStatus !== 'playing';

  if (hadSession && (trackChanged || statusStopped)) {
    _closeActiveSession(now, playbackProgressState);
  }

  const shouldStart = newStatus === 'playing' && (!_activeSession || _activeSession.trackKey !== newTrackKey);
  if (shouldStart) {
    _startSession(now, meta, newTrackKey, playbackProgressState);
  }
}

function getRecentSamples() {
  return _samples.slice();
}

// Merge a persisted history of samples (from the main-process stats-store)
// into the in-memory buffer. Duplicate ids are de-duped; the result is
// still bounded by MAX_RECENT_SAMPLES.
function preloadSamples(samples) {
  if (!Array.isArray(samples) || samples.length === 0) return;

  const byId = new Map();
  for (const s of _samples) {
    if (!s || !s.id) continue;
    byId.set(s.id, s);
  }
  for (const s of samples) {
    if (!s || !s.id) continue;
    if (!byId.has(s.id)) byId.set(s.id, s);
  }

  _samples = Array.from(byId.values());

  if (_samples.length > MAX_RECENT_SAMPLES) {
    _samples.sort((a, b) => (a.startedAt || 0) - (b.startedAt || 0));
    _samples = _samples.slice(_samples.length - MAX_RECENT_SAMPLES);
  }
}

module.exports = {
  onMetadataChanged,
  getRecentSamples,
  preloadSamples
};
