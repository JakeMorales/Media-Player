'use strict';

// player.js — Playback state, audio detection, source inference, metadata model

const { shell }      = require('electron');
const labelTheme     = require('./label-theme');
const artTransition  = require('./art-transition');
const volumeControl  = require('./volume-control');
const transport      = require('./transport');

function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

const SOURCE_PRESETS = {
  spotify: { id: 'spotify', label: 'Spotify',       accent: '#38c976' },
  apple:   { id: 'apple',   label: 'Apple Music',   accent: '#ff6b8f' },
  youtube: { id: 'youtube', label: 'YouTube',        accent: '#ff5b52' },
  browser: { id: 'browser', label: 'Browser',        accent: '#62a0ff' },
  unknown: { id: 'unknown', label: 'Unknown Source', accent: '#7c8ea6' }
};

const currentMeta = {
  appId: '', title: '', artist: '', album: '', artwork: '',
  playbackStatus: 'paused',
  controls: { canPlay: true, canPause: true, canSkipNext: true, canSkipPrevious: true },
  durationMs: 0, positionMs: 0
};

const playbackProgressState = {
  durationMs: 0, positionMs: 0, playing: false, trackKey: '', lastTickMs: 0
};

// --- Source inference & URL helpers ---

function inferSource(appId) {
  const id = (appId || '').toLowerCase();
  if (id.includes('spotify')) return SOURCE_PRESETS.spotify;
  if (id.includes('applemusic') || id.includes('itunes') || id.includes('apple music')) return SOURCE_PRESETS.apple;
  if (id.includes('youtube') || id.includes('ytmusic')) return SOURCE_PRESETS.youtube;
  if (id.includes('chrome') || id.includes('msedge') || id.includes('firefox') || id.includes('opera') || id.includes('brave')) return SOURCE_PRESETS.browser;
  return SOURCE_PRESETS.unknown;
}

function buildSourceUrl(kind, meta) {
  const source = inferSource(meta.appId);
  const title = (meta.title || '').trim();
  const artist = (meta.artist || '').trim();
  const album = (meta.album || '').trim();
  let query = '';
  if (kind === 'title') query = [title, artist].filter(Boolean).join(' ');
  else if (kind === 'album') query = [album || title, artist].filter(Boolean).join(' ');
  else query = artist || title;
  if (!query) return '';
  const encoded = encodeURIComponent(query);
  if (source.id === 'spotify') return `spotify:search:${encoded}`;
  if (source.id === 'apple') return `https://music.apple.com/us/search?term=${encoded}`;
  if (source.id === 'youtube') return `https://music.youtube.com/search?q=${encoded}`;
  return `https://www.google.com/search?q=${encoded}`;
}

function openMetadataUrl(kind) {
  const url = buildSourceUrl(kind, currentMeta);
  if (url) shell.openExternal(url).catch(() => {});
}

// --- Metadata model ---

let _els = {};
let _onAlbumMarquee = null;
let _uiThemeGetter = null;
const sessionTracker = require('./stats/session-tracker');

function setMetadata(meta) {
  const prevTrackKey = playbackProgressState.trackKey;
  const prevStatus   = currentMeta.playbackStatus || 'paused';


  currentMeta.appId          = meta.appId || '';
  currentMeta.title          = meta.title || '';
  currentMeta.artist         = meta.artist || '';
  currentMeta.album          = meta.album || '';
  currentMeta.artwork        = meta.artwork || '';
  currentMeta.playbackStatus = (meta.playbackStatus || 'paused').toLowerCase();
  currentMeta.durationMs     = Number.isFinite(meta.durationMs) ? Math.max(0, Number(meta.durationMs)) : 0;
  currentMeta.positionMs     = Number.isFinite(meta.positionMs) ? Math.max(0, Number(meta.positionMs)) : 0;
  currentMeta.controls = {
    canPlay:         meta.controls ? meta.controls.canPlay !== false : true,
    canPause:        meta.controls ? meta.controls.canPause !== false : true,
    canSkipNext:     meta.controls ? meta.controls.canSkipNext !== false : true,
    canSkipPrevious: meta.controls ? meta.controls.canSkipPrevious !== false : true
  };

  if (_els.artistEl)     _els.artistEl.textContent    = meta.artist || 'Unknown Artist';
  if (_els.albumTextEl)  _els.albumTextEl.textContent  = meta.album ? meta.album : 'Album unknown';
  else if (_els.albumEl) _els.albumEl.textContent      = meta.album ? meta.album : 'Album unknown';
  if (_els.titleEl)       _els.titleEl.textContent      = meta.title || 'Unknown Track';
  if (_els.glassTitleEl)  _els.glassTitleEl.textContent  = meta.title || 'Unknown Track';
  if (_els.glassArtistEl) _els.glassArtistEl.textContent = meta.artist || 'Unknown Artist';
  if (_els.glassAlbumEl)  _els.glassAlbumEl.textContent  = meta.album || 'Album unknown';
  if (_els.miniTitleEl)   _els.miniTitleEl.textContent   = meta.title || 'Unknown Track';
  if (_els.miniArtistEl)  _els.miniArtistEl.textContent  = meta.artist || 'Unknown Artist';

  volumeControl.updateVolumeUiSource(inferSource(currentMeta.appId));
  transport.updateTransportUi(currentMeta);

  if (_els.labelTitleEl)  _els.labelTitleEl.textContent  = labelTheme.fitLabelText(meta.title || 'Unknown Track', 16);
  if (_els.labelArtistEl) _els.labelArtistEl.textContent = labelTheme.fitLabelText(meta.artist || 'Unknown Artist', 16);
  labelTheme.applyRecordLabelTheme(meta);

  const trackKey = `${currentMeta.appId}|${currentMeta.title}|${currentMeta.artist}`;
  const isNewTrack = !!(prevTrackKey && prevTrackKey !== trackKey);
  artTransition.handleMetaUpdate(meta, trackKey, isNewTrack);

  playbackProgressState.trackKey   = trackKey;
  playbackProgressState.playing    = currentMeta.playbackStatus === 'playing';
  playbackProgressState.lastTickMs = performance.now();

  const fallbackDuration = 3 * 60 * 1000;
  const duration = currentMeta.durationMs > 0 ? currentMeta.durationMs : fallbackDuration;
    playbackProgressState.durationMs = duration;
  playbackProgressState.positionMs = clamp(currentMeta.positionMs || 0, 0, duration);

  // Stats pipeline hook (Phase 2): passively record listening sessions.
  try {
    sessionTracker.onMetadataChanged({
      prevTrackKey,
      prevStatus,
      meta: Object.assign({}, currentMeta),
      playbackProgressState: Object.assign({}, playbackProgressState)
    });
  } catch (_) {
    // Stats are best-effort and must never interfere with playback or UI.
  }

  const isDarkTheme = _uiThemeGetter ? ['dark', 'transparent'].includes(_uiThemeGetter()) : false;

  document.documentElement.style.setProperty('--label-panel-rgb', isDarkTheme ? '230, 238, 248' : '255, 248, 216');

  if (_onAlbumMarquee) _onAlbumMarquee();
}

// --- Audio activity detection ---

function detectAudioActive(freqData, state, cfg) {
  const n = Math.min(freqData.length, cfg.activity.sampleBins);
  let sum = 0;
  for (let i = 0; i < n; i++) sum += freqData[i];
  const level = (sum / n) / 255;

  if (level >= cfg.activity.threshold) { state.hotFrames += 1; state.coldFrames = 0; }
  else { state.coldFrames += 1; state.hotFrames = 0; }

  if (!state.active && state.hotFrames >= cfg.activity.attackFrames) state.active = true;
  if (state.active && state.coldFrames >= cfg.activity.releaseFrames) state.active = false;

  return { active: state.active, level };
}

// --- Arc / needle motion ---

function updateArcMotion(freqData, state, active, level) {
  const rootStyle = document.documentElement.style;
  if (!document.getElementById('rightPane')) return;

  const bassBins = Math.min(freqData.length, 44);
  let bassSum = 0;
  for (let i = 0; i < bassBins; i++) bassSum += freqData[i];
  const bassNow = bassBins > 0 ? (bassSum / bassBins) / 255 : 0;

  state.bass = state.bass * 0.9 + bassNow * 0.1;
  const transient = Math.max(0, bassNow - state.bass);
  const targetPulse = active ? (state.bass * 0.65 + transient * 0.75 + level * 0.08) : 0;
  state.pulse = state.pulse * 0.9 + targetPulse * 0.1;

  const bounce  = clamp(state.pulse * 8 + state.bass * 3, 0, 8);
  const spread  = clamp(state.pulse * 0.1 + state.bass * 0.04, 0, 0.12);
  const shift   = clamp(state.pulse * 6 + state.bass * 2.5, 0, 7);
  const opacity = clamp(0.44 + state.pulse * 0.14 + state.bass * 0.06, 0.42, 0.62);

  rootStyle.setProperty('--arc-bounce-y', (bounce / 100).toFixed(3));
  rootStyle.setProperty('--arc-spread', spread.toFixed(3));
  rootStyle.setProperty('--arc-shift-x', `${shift.toFixed(2)}px`);
  rootStyle.setProperty('--arc-opacity', opacity.toFixed(3));
}

// --- Playback progress tick ---

function updatePlaybackProgress(nowMs) {
  const miniProgressFillEl = _els.miniProgressFillEl;
  if (!miniProgressFillEl) return;

  if (playbackProgressState.playing) {
    playbackProgressState.positionMs += Math.max(0, nowMs - playbackProgressState.lastTickMs);
  }
  playbackProgressState.lastTickMs = nowMs;

  const duration = Math.max(1, playbackProgressState.durationMs || (3 * 60 * 1000));
  playbackProgressState.positionMs = clamp(playbackProgressState.positionMs, 0, duration);
  const pct = clamp((playbackProgressState.positionMs / duration) * 100, 0, 100);
  miniProgressFillEl.style.width = `${pct.toFixed(2)}%`;

  const rootStyle = document.documentElement.style;
  const trackT = clamp(pct / 100, 0, 1);
  const sway = Math.sin(nowMs / 430) * (currentMeta.playbackStatus === 'playing' ? 0.9 : 0.25);
  rootStyle.setProperty('--tonearm-track', trackT.toFixed(4));
  rootStyle.setProperty('--tonearm-sway', `${sway.toFixed(2)}deg`);
}

// --- Init ---

function init(els, opts = {}) {
  _els = els || {};
  _onAlbumMarquee = typeof opts.onAlbumMarquee === 'function' ? opts.onAlbumMarquee : null;
  _uiThemeGetter  = typeof opts.uiThemeGetter  === 'function' ? opts.uiThemeGetter  : null;
}

module.exports = {
  init, currentMeta, playbackProgressState, SOURCE_PRESETS,
  inferSource, buildSourceUrl, openMetadataUrl, setMetadata,
  detectAudioActive, updateArcMotion, updatePlaybackProgress
};
