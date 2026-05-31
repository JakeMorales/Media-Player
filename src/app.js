const cfg        = require('./config');
const { initAudio }      = require('./audio');
const { initRenderer }   = require('./renderer');
const { initVisualizer } = require('./visualizer');
const { ipcRenderer, shell }    = require('electron');

const statusEl = document.getElementById('status');
const widgetEl = document.getElementById('widget');
const frameEl = document.getElementById('frame');
const artistEl = document.getElementById('artist');
const albumEl = document.getElementById('album');
const albumTextEl = document.getElementById('albumText');
const titleEl = document.getElementById('title');
const miniTitleEl = document.getElementById('miniTitle');
const miniArtistEl = document.getElementById('miniArtist');
const miniArtEl = document.getElementById('miniArt');
const miniArtWrapEl = document.getElementById('miniArtWrap');
const miniSpectrumEl = document.getElementById('miniSpectrum');
const miniProgressFillEl = document.getElementById('miniProgressFill');
const miniPaneEl = document.getElementById('miniPane');
const glassTitleEl = document.getElementById('glassTitle');
const glassArtistEl = document.getElementById('glassArtist');
const glassAlbumEl = document.getElementById('glassAlbum');
const sourceKnobEl = document.getElementById('sourceKnob');
const sourceVolumeGlassEl = document.getElementById('sourceVolumeGlass');
const volumeValueGlassEl = document.getElementById('volumeValueGlass');
const volumeBtnGlassEl = document.getElementById('volumeBtnGlass');
const btnPrevEl = document.getElementById('btnPrev');
const btnPlayPauseEl = document.getElementById('btnPlayPause');
const btnNextEl = document.getElementById('btnNext');
const btnPrevGlassEl = document.getElementById('btnPrevGlass');
const btnPlayPauseGlassEl = document.getElementById('btnPlayPauseGlass');
const btnNextGlassEl = document.getElementById('btnNextGlass');
const btnPrevMiniEl = document.getElementById('btnPrevMini');
const btnPlayPauseMiniEl = document.getElementById('btnPlayPauseMini');
const btnNextMiniEl = document.getElementById('btnNextMini');
const btnMiniCollapseEl = document.getElementById('btnMiniCollapse');
const btnSettingsEl = document.getElementById('btnSettings');
const settingsPanelEl = document.getElementById('settingsPanel');
const themeSelectEl = document.getElementById('themeSelect');
const scaleSliderEl = document.getElementById('scaleSlider');
const clearGlassToggleEl = document.getElementById('clearGlassToggle');
const launchToggleEl = document.getElementById('launchToggle');
const miniModeToggleEl = document.getElementById('miniModeToggle');
const btnCloseAppEl = document.getElementById('btnCloseApp');
const glassMenuBtnEl = document.getElementById('glassMenuBtn');
const glassQuickMenuEl = document.getElementById('glassQuickMenu');
const quickMiniEl = document.getElementById('quickMini');
const quickSettingsEl = document.getElementById('quickSettings');
const resizeHandleEl = document.getElementById('resizeHandle');
const pinBtnEl = document.getElementById('pinBtn');
const rightPaneEl = document.getElementById('rightPane');
const recordEl = document.getElementById('record');
const sleeveArtEl = document.getElementById('sleeveArt');
const recordArtEl = document.getElementById('recordArt');
const glassSpectrumEl = document.getElementById('glassSpectrum');
const labelTitleEl = document.getElementById('labelTitle');
const labelArtistEl = document.getElementById('labelArtist');
const rootStyle = document.documentElement.style;
let dragging = false;
let pointerDown = false;
let compactMode = false;
let currentView = 'full';
let isTransitioning = false;
let isPinned = false;
let pinHoverTimer = null;
const PIN_CORNER_PX = 64;
const RESIZE_CORNER_PX = 48;
let pendingToggleClick = false;
let pointerDownX = 0;
let pointerDownY = 0;
let isHoveringWidget = false;
let lastMouseX = 0;
let lastMouseY = 0;
let settingsOpen = false;
let quickMenuOpen = false;
let resizing = false;
let resizeStartX = 0;
let resizeStartWidth = 0;
let suppressNextWidgetToggle = false;
const dragState = { offsetX: 0, offsetY: 0 };
const DRAG_THRESHOLD = 6;
const MIN_SCALE = 0.7;
const MAX_SCALE = 1.35;
const uiState = {
  scale: 1,
  baseWidth: cfg.widget.width,
  miniMode: false,
  theme: 'light',
  clearGlass: true
};
const volumeControlState = {
  volume: 0.5,
  dragging: false,
  startY: 0,
  startVolume: 0,
  commitTimer: null,
  sourceLabel: 'Unknown Source',
  muted: false,
  lastAudibleVolume: 0.5
};
let currentMeta = {
  appId: '',
  title: '',
  artist: '',
  album: '',
  artwork: '',
  playbackStatus: 'paused',
  controls: { canPlay: true, canPause: true, canSkipNext: true, canSkipPrevious: true },
  durationMs: 0,
  positionMs: 0
};

const playbackProgressState = {
  durationMs: 0,
  positionMs: 0,
  playing: false,
  trackKey: '',
  lastTickMs: 0
};

const SOURCE_PRESETS = {
  spotify: { id: 'spotify', label: 'Spotify', accent: '#38c976' },
  apple: { id: 'apple', label: 'Apple Music', accent: '#ff6b8f' },
  youtube: { id: 'youtube', label: 'YouTube', accent: '#ff5b52' },
  browser: { id: 'browser', label: 'Browser', accent: '#62a0ff' },
  unknown: { id: 'unknown', label: 'Unknown Source', accent: '#7c8ea6' }
};

const labelThemeCache = new Map();
let labelThemeToken = 0;

const fallbackLabelPalettes = [
  { base: [246, 223, 24], ring: [215, 72, 54], panel: [255, 248, 216], ink: [20, 24, 35] },
  { base: [242, 97, 52], ring: [171, 40, 42], panel: [255, 237, 224], ink: [26, 18, 20] },
  { base: [85, 163, 221], ring: [52, 94, 176], panel: [233, 244, 255], ink: [17, 28, 46] },
  { base: [77, 176, 121], ring: [44, 112, 73], panel: [233, 248, 237], ink: [16, 32, 23] },
  { base: [231, 181, 66], ring: [148, 83, 38], panel: [255, 243, 214], ink: [34, 24, 13] }
];

const spectrumState = {
  ctx: glassSpectrumEl ? glassSpectrumEl.getContext('2d') : null,
  width: 0,
  height: 0,
  dpr: 1,
  centerX: 0,
  centerY: 0,
  recordRadius: 0,
  levels: new Float32Array(64),
  bass: 0,
  idlePhase: 0,
  geomStamp: ''
};

const miniSpectrumState = {
  ctx: miniSpectrumEl ? miniSpectrumEl.getContext('2d') : null,
  width: 0,
  height: 0,
  dpr: 1,
  levels: new Float32Array(24),
  phase: 0
};

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function clampScale(value) {
  return clamp(value, MIN_SCALE, MAX_SCALE);
}

function isLidLikeView(view = currentView) {
  return view === 'lid' || view === 'mini-lid';
}

function applyTheme(theme) {
  uiState.theme = theme;
  if (widgetEl) {
    widgetEl.dataset.theme = theme;
  }
}

function applyGlassClarity(enabled) {
  uiState.clearGlass = !!enabled;
  rootStyle.setProperty('--glass-clarity', enabled ? '0.28' : '0.72');
}

function setCurrentView(view) {
  currentView = view;
  compactMode = isLidLikeView(view);
  if (widgetEl) widgetEl.dataset.view = view;
  if (miniModeToggleEl) miniModeToggleEl.checked = view === 'mini' || view === 'mini-lid';
}

function setSettingsOpen(open) {
  settingsOpen = !!open;
  if (settingsPanelEl) {
    settingsPanelEl.dataset.open = settingsOpen ? 'true' : 'false';
    settingsPanelEl.setAttribute('aria-hidden', settingsOpen ? 'false' : 'true');
  }
}

function setQuickMenuOpen(open) {
  quickMenuOpen = !!open;
  if (glassQuickMenuEl) {
    glassQuickMenuEl.dataset.open = quickMenuOpen ? 'true' : 'false';
    glassQuickMenuEl.setAttribute('aria-hidden', quickMenuOpen ? 'false' : 'true');
  }
}

function hashString(value) {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function rgbToHsl(r, g, b) {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const d = max - min;
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    switch (max) {
      case rn: h = ((gn - bn) / d) % 6; break;
      case gn: h = ((bn - rn) / d) + 2; break;
      default: h = ((rn - gn) / d) + 4; break;
    }
    h *= 60;
    if (h < 0) h += 360;
  }
  return [h, s, l];
}

function hslToRgb(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = h / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r1 = 0;
  let g1 = 0;
  let b1 = 0;

  if (hp >= 0 && hp < 1) [r1, g1, b1] = [c, x, 0];
  else if (hp < 2) [r1, g1, b1] = [x, c, 0];
  else if (hp < 3) [r1, g1, b1] = [0, c, x];
  else if (hp < 4) [r1, g1, b1] = [0, x, c];
  else if (hp < 5) [r1, g1, b1] = [x, 0, c];
  else [r1, g1, b1] = [c, 0, x];

  const m = l - c / 2;
  return [
    Math.round((r1 + m) * 255),
    Math.round((g1 + m) * 255),
    Math.round((b1 + m) * 255)
  ];
}

function setLabelTheme(theme) {
  rootStyle.setProperty('--label-base-rgb', theme.base.join(', '));
  rootStyle.setProperty('--label-ring-rgb', theme.ring.join(', '));
  rootStyle.setProperty('--label-panel-rgb', theme.panel.join(', '));
  rootStyle.setProperty('--label-ink-rgb', theme.ink.join(', '));
  const panelLum = (0.2126 * theme.panel[0] + 0.7152 * theme.panel[1] + 0.0722 * theme.panel[2]) / 255;
  if (panelLum > 0.64) {
    rootStyle.setProperty('--record-groove-rgb', '38, 44, 58');
    rootStyle.setProperty('--record-groove-alpha', '0.2');
  } else {
    rootStyle.setProperty('--record-groove-rgb', '236, 245, 255');
    rootStyle.setProperty('--record-groove-alpha', '0.24');
  }
}

function themeFromKey(meta) {
  const key = `${meta.title || ''}|${meta.artist || ''}`;
  const idx = hashString(key) % fallbackLabelPalettes.length;
  return fallbackLabelPalettes[idx];
}

function themeFromArtworkAvg(avgRgb) {
  const [h, s, l] = rgbToHsl(avgRgb[0], avgRgb[1], avgRgb[2]);
  const sat = clamp(s * 1.15, 0.45, 0.92);
  const baseL = clamp(l * 0.9 + 0.05, 0.38, 0.62);
  const ringL = clamp(baseL * 0.62, 0.24, 0.42);
  const panelL = clamp(0.9 + (0.5 - l) * 0.08, 0.82, 0.94);

  return {
    base: hslToRgb(h, sat, baseL),
    ring: hslToRgb((h + 18) % 360, clamp(sat * 0.88, 0.34, 0.8), ringL),
    panel: hslToRgb(h, clamp(s * 0.35, 0.16, 0.34), panelL),
    ink: hslToRgb((h + 210) % 360, 0.24, 0.14)
  };
}

function sampleArtworkAverageColor(url) {
  return new Promise((resolve, reject) => {
    if (!url) {
      reject(new Error('No artwork URL'));
      return;
    }

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    img.onload = () => {
      try {
        const w = 28;
        const h = 28;
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) throw new Error('Canvas context unavailable');
        ctx.drawImage(img, 0, 0, w, h);
        const data = ctx.getImageData(0, 0, w, h).data;

        let rSum = 0;
        let gSum = 0;
        let bSum = 0;
        let weightSum = 0;

        for (let i = 0; i < data.length; i += 4) {
          const a = data[i + 3] / 255;
          if (a < 0.85) continue;
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          const max = Math.max(r, g, b);
          const min = Math.min(r, g, b);
          const sat = max === 0 ? 0 : (max - min) / max;
          const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
          if (lum < 0.06 || lum > 0.97) continue;
          const weight = 0.5 + sat * 1.35;
          rSum += r * weight;
          gSum += g * weight;
          bSum += b * weight;
          weightSum += weight;
        }

        if (weightSum < 1) throw new Error('No usable pixels');
        resolve([
          Math.round(rSum / weightSum),
          Math.round(gSum / weightSum),
          Math.round(bSum / weightSum)
        ]);
      } catch (err) {
        reject(err);
      }
    };
    img.onerror = () => reject(new Error('Artwork load failed'));
    img.src = url;
  });
}

async function applyRecordLabelTheme(meta) {
  const token = ++labelThemeToken;
  const artwork = meta.artwork || '';
  try {
    if (!artwork) throw new Error('Missing artwork');

    let theme = labelThemeCache.get(artwork);
    if (!theme) {
      const avg = await sampleArtworkAverageColor(artwork);
      theme = themeFromArtworkAvg(avg);
      labelThemeCache.set(artwork, theme);
    }

    if (token !== labelThemeToken) return;
    setLabelTheme(theme);
  } catch {
    if (token !== labelThemeToken) return;
    setLabelTheme(themeFromKey(meta));
  }
}

function fitLabelText(value, maxLen) {
  const s = (value || '').replace(/\s+/g, ' ').trim();
  if (!s) return '';
  if (s.length <= maxLen) return s;
  return `${s.slice(0, maxLen - 1)}...`;
}

function updateAlbumMarqueeState() {
  if (!albumEl || !albumTextEl) return;
  const overflow = albumTextEl.scrollWidth - albumEl.clientWidth;
  if (overflow > 4) {
    albumEl.classList.add('can-scroll');
    albumEl.style.setProperty('--album-scroll-target', `-${Math.ceil(overflow)}px`);
    const duration = Math.min(9, Math.max(3, overflow / 34));
    albumEl.style.setProperty('--album-scroll-duration', `${duration.toFixed(2)}s`);
  } else {
    albumEl.classList.remove('can-scroll');
    albumEl.style.setProperty('--album-scroll-target', '0px');
  }
}

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
  if (source.id === 'browser') return `https://www.google.com/search?q=${encoded}`;
  return `https://www.google.com/search?q=${encoded}`;
}

function openMetadataUrl(kind) {
  const url = buildSourceUrl(kind, currentMeta || {});
  if (!url) return;
  shell.openExternal(url).catch(() => {});
}

function bindMetadataLinks() {
  const links = [
    [titleEl, 'title'],
    [artistEl, 'artist'],
    [albumEl, 'album'],
    [glassTitleEl, 'title'],
    [glassArtistEl, 'artist'],
    [glassAlbumEl, 'album']
  ];

  for (const [el, kind] of links) {
    if (!el) continue;
    el.dataset.link = 'true';
    el.title = 'Open in source';
    el.addEventListener('click', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      openMetadataUrl(kind);
    });
  }
}

function setTransportEnabled(enabled) {
  const btns = [btnPrevEl, btnPlayPauseEl, btnNextEl, btnPrevGlassEl, btnPlayPauseGlassEl, btnNextGlassEl, btnPrevMiniEl, btnPlayPauseMiniEl, btnNextMiniEl];
  for (const btn of btns) {
    if (!btn) continue;
    btn.disabled = !enabled;
  }
}

function updateTransportUi(meta) {
  const controls = meta.controls || {};
  const canPrev = controls.canSkipPrevious !== false;
  const canNext = controls.canSkipNext !== false;
  const canPlay = controls.canPlay !== false;
  const canPause = controls.canPause !== false;

  if (btnPrevEl) btnPrevEl.disabled = !canPrev;
  if (btnNextEl) btnNextEl.disabled = !canNext;
  if (btnPrevGlassEl) btnPrevGlassEl.disabled = !canPrev;
  if (btnNextGlassEl) btnNextGlassEl.disabled = !canNext;
  if (btnPrevMiniEl) btnPrevMiniEl.disabled = !canPrev;
  if (btnNextMiniEl) btnNextMiniEl.disabled = !canNext;

  const canToggle = canPlay || canPause;
  if (btnPlayPauseEl) {
    btnPlayPauseEl.disabled = !canToggle;
    const playing = (meta.playbackStatus || '').toLowerCase() === 'playing';
    btnPlayPauseEl.dataset.playing = playing ? 'true' : 'false';
    btnPlayPauseEl.setAttribute('aria-label', playing ? 'Pause' : 'Play');
    btnPlayPauseEl.title = playing ? 'Pause' : 'Play';
  }

  if (btnPlayPauseGlassEl) {
    btnPlayPauseGlassEl.disabled = !canToggle;
    const playing = (meta.playbackStatus || '').toLowerCase() === 'playing';
    btnPlayPauseGlassEl.dataset.playing = playing ? 'true' : 'false';
    btnPlayPauseGlassEl.setAttribute('aria-label', playing ? 'Pause' : 'Play');
    btnPlayPauseGlassEl.title = playing ? 'Pause' : 'Play';
  }

  if (btnPlayPauseMiniEl) {
    btnPlayPauseMiniEl.disabled = !canToggle;
    const playing = (meta.playbackStatus || '').toLowerCase() === 'playing';
    btnPlayPauseMiniEl.dataset.playing = playing ? 'true' : 'false';
    btnPlayPauseMiniEl.setAttribute('aria-label', playing ? 'Pause' : 'Play');
    btnPlayPauseMiniEl.title = playing ? 'Pause' : 'Play';
  }
}

function triggerMediaControl(action) {
  ipcRenderer.invoke('media-control', action).catch(() => {});
}

function bindTransportControls() {
  if (btnPrevEl) {
    btnPrevEl.addEventListener('click', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      triggerMediaControl('previous');
    });
  }

  if (btnPlayPauseEl) {
    btnPlayPauseEl.addEventListener('click', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      triggerMediaControl('playpause');
    });
  }

  if (btnNextEl) {
    btnNextEl.addEventListener('click', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      triggerMediaControl('next');
    });
  }

  if (btnPrevGlassEl) {
    btnPrevGlassEl.addEventListener('click', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      triggerMediaControl('previous');
    });
  }

  if (btnPlayPauseGlassEl) {
    btnPlayPauseGlassEl.addEventListener('click', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      triggerMediaControl('playpause');
    });
  }

  if (btnNextGlassEl) {
    btnNextGlassEl.addEventListener('click', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      triggerMediaControl('next');
    });
  }

  if (btnPrevMiniEl) {
    btnPrevMiniEl.addEventListener('click', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      triggerMediaControl('previous');
    });
  }

  if (btnPlayPauseMiniEl) {
    btnPlayPauseMiniEl.addEventListener('click', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      triggerMediaControl('playpause');
    });
  }

  if (btnNextMiniEl) {
    btnNextMiniEl.addEventListener('click', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      triggerMediaControl('next');
    });
  }

  if (btnMiniCollapseEl) {
    btnMiniCollapseEl.addEventListener('mousedown', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      suppressNextWidgetToggle = true;
      setCurrentView('lid');
      applyWidgetSize();
      updateGlassSpectrumGeometry(true);
    });
  }
}

function volumeToAngle(volume) {
  return -24 + clamp(volume, 0, 1) * 52;
}

function queueSystemVolumeCommit(volume) {
  if (volumeControlState.commitTimer) clearTimeout(volumeControlState.commitTimer);
  volumeControlState.commitTimer = setTimeout(() => {
    ipcRenderer.invoke('system-volume:set', volume).catch(() => {});
  }, 90);
}

function setVolumeUi(volume) {
  const v = clamp(volume, 0, 1);
  volumeControlState.volume = v;
  volumeControlState.muted = v <= 0.001;
  if (!volumeControlState.muted) {
    volumeControlState.lastAudibleVolume = v;
  }
  const pct = Math.round(v * 100);
  rootStyle.setProperty('--source-knob-angle', `${volumeToAngle(v).toFixed(2)}deg`);
  rootStyle.setProperty('--source-volume-pct', `${pct}%`);
  if (sourceKnobEl) {
    sourceKnobEl.title = `Audio source: ${volumeControlState.sourceLabel} | Volume ${pct}%`;
  }
  if (sourceVolumeGlassEl) {
    sourceVolumeGlassEl.value = String(pct);
    sourceVolumeGlassEl.title = `Audio source: ${volumeControlState.sourceLabel} | Volume ${pct}%`;
  }
  if (volumeBtnGlassEl) {
    volumeBtnGlassEl.dataset.muted = volumeControlState.muted ? 'true' : 'false';
    volumeBtnGlassEl.title = volumeControlState.muted ? 'Unmute' : 'Mute';
  }
  if (volumeValueGlassEl) {
    volumeValueGlassEl.textContent = `${pct}%`;
  }
}

function onVolumeButtonGlassClick(ev) {
  if (!volumeBtnGlassEl) return;
  ev.preventDefault();
  ev.stopPropagation();

  const next = volumeControlState.muted
    ? clamp(volumeControlState.lastAudibleVolume > 0.01 ? volumeControlState.lastAudibleVolume : 0.5, 0, 1)
    : 0;

  if (!volumeControlState.muted && volumeControlState.volume > 0.01) {
    volumeControlState.lastAudibleVolume = volumeControlState.volume;
  }

  setVolumeUi(next);
  if (volumeControlState.commitTimer) {
    clearTimeout(volumeControlState.commitTimer);
    volumeControlState.commitTimer = null;
  }
  ipcRenderer.invoke('system-volume:set', next).catch(() => {});
  volumeBtnGlassEl.blur();
}

async function loadSystemVolume() {
  try {
    const level = await ipcRenderer.invoke('system-volume:get');
    if (Number.isFinite(level)) setVolumeUi(level);
  } catch {}
}

function onSourceKnobMouseDown(ev) {
  if (!sourceKnobEl || ev.button !== 0) return;
  volumeControlState.dragging = true;
  volumeControlState.startY = ev.clientY;
  volumeControlState.startVolume = volumeControlState.volume;
  setWidgetInteractive(true);
  ev.preventDefault();
  ev.stopPropagation();
}

function onSourceKnobWheel(ev) {
  if (!sourceKnobEl) return;
  const delta = ev.deltaY > 0 ? -0.06 : 0.06;
  const next = clamp(volumeControlState.volume + delta, 0, 1);
  setVolumeUi(next);
  queueSystemVolumeCommit(next);
  ev.preventDefault();
  ev.stopPropagation();
}

function onSourceKnobMouseMove(ev) {
  if (!volumeControlState.dragging) return;
  const delta = (volumeControlState.startY - ev.clientY) / 120;
  const next = clamp(volumeControlState.startVolume + delta, 0, 1);
  setVolumeUi(next);
  queueSystemVolumeCommit(next);
}

function onSourceKnobMouseUp() {
  if (!volumeControlState.dragging) return;
  volumeControlState.dragging = false;
  if (volumeControlState.commitTimer) {
    clearTimeout(volumeControlState.commitTimer);
    volumeControlState.commitTimer = null;
  }
  ipcRenderer.invoke('system-volume:set', volumeControlState.volume).catch(() => {});
  setWidgetInteractive(isMouseOverWidget(lastMouseX, lastMouseY));
}

function onSourceVolumeGlassInput(ev) {
  if (!sourceVolumeGlassEl) return;
  const raw = Number(ev.target && ev.target.value);
  const next = clamp(Number.isFinite(raw) ? raw / 100 : volumeControlState.volume, 0, 1);
  setVolumeUi(next);
  ipcRenderer.invoke('system-volume:set', next).catch(() => {});
  setWidgetInteractive(true);
  ev.preventDefault();
  ev.stopPropagation();
}

function onSourceVolumeGlassWheel(ev) {
  if (!sourceVolumeGlassEl) return;
  const delta = ev.deltaY > 0 ? -0.06 : 0.06;
  const next = clamp(volumeControlState.volume + delta, 0, 1);
  setVolumeUi(next);
  queueSystemVolumeCommit(next);
  ev.preventDefault();
  ev.stopPropagation();
}

function onSourceVolumeGlassCommit(ev) {
  if (volumeControlState.commitTimer) {
    clearTimeout(volumeControlState.commitTimer);
    volumeControlState.commitTimer = null;
  }
  const raw = Number(ev && ev.target && ev.target.value);
  const next = clamp(Number.isFinite(raw) ? raw / 100 : volumeControlState.volume, 0, 1);
  setVolumeUi(next);
  ipcRenderer.invoke('system-volume:set', next).catch(() => {});
  setWidgetInteractive(isMouseOverWidget(lastMouseX, lastMouseY));
}

function updateVolumeUiSource(meta) {
  const source = inferSource(meta.appId);
  rootStyle.setProperty('--source-accent', source.accent);
  volumeControlState.sourceLabel = source.label;
  setVolumeUi(volumeControlState.volume);
}

function applyWidgetSize() {
  if (!widgetEl) return;
  const rect = widgetEl.getBoundingClientRect();
  const isLeftAnchored = widgetEl.style.left && widgetEl.style.left !== 'auto';
  if (isLeftAnchored) {
    const rightOffset = Math.max(0, window.innerWidth - rect.right);
    widgetEl.style.left = 'auto';
    widgetEl.style.right = `${rightOffset}px`;
  }

  const maxW = Math.max(280, window.innerWidth - 24);
  const scaledBaseW = Math.round(uiState.baseWidth * uiState.scale);
  const baseW = Math.min(scaledBaseW, maxW);
  const baseH = Math.round(baseW / 2);
  const lidW = Math.round(baseW * 0.5);
  const miniW = lidW;
  const miniLidW = Math.max(110, Math.round(miniW * 0.5));
  const miniLidH = Math.max(72, Math.round(baseH * 0.5));

  let w = baseW;
  let h = baseH;
  if (currentView === 'lid') {
    w = lidW;
  } else if (currentView === 'mini') {
    w = miniW;
    h = Math.max(84, Math.round(baseH * 0.34));
  } else if (currentView === 'mini-lid') {
    w = miniLidW;
    h = miniLidH;
  }

  widgetEl.style.width = `${w}px`;
  widgetEl.style.height = `${h}px`;

  // Record position as fixed pixel distances from the widget's right edge.
  // The widget is right-anchored (right: 18px), so its right edge never moves
  // during width transitions — right:Xpx on the record stays screen-stable.
  const recordEl = document.getElementById('record');
  const recordHalfW = recordEl ? Math.round(recordEl.offsetWidth / 2) : 136;
  document.documentElement.style.setProperty('--record-right-full', `${Math.round(baseW / 2) - recordHalfW}px`);
  document.documentElement.style.setProperty('--record-right-lid',  `${Math.round(lidW * 0.49) - recordHalfW}px`);
}

function isTextTarget(target) {
  if (!(target instanceof Element)) return false;
  return !!target.closest('#title, #artist, #album, #glassTitle, #glassArtist, #glassAlbum, #sourceKnob, #sourceVolumeGlass, #volumeBtnGlass, #volumePopup, #btnPrev, #btnPlayPause, #btnNext, #btnPrevGlass, #btnPlayPauseGlass, #btnNextGlass, #btnPrevMini, #btnPlayPauseMini, #btnNextMini, #btnMiniCollapse, #miniContent, #miniProgress, #btnSettings, #settingsPanel, #glassMenuBtn, #glassQuickMenu, #quickMini, #quickSettings, #resizeHandle, #labelTitle, #labelArtist, #labelTopText, #labelCatalog, #labelSideText, #pinBtn');
}

function toggleCompactMode() {
  if (isTransitioning) return;
  isTransitioning = true;
  if (currentView === 'mini') {
    setCurrentView('mini-lid');
  } else if (currentView === 'mini-lid') {
    setCurrentView('mini');
  } else {
    setCurrentView(compactMode ? 'full' : 'lid');
  }
  applyWidgetSize();
  updateGlassSpectrumGeometry(true);
  if (widgetEl) {
    widgetEl.dataset.transitioning = 'true';
    // Close → lid: 1050ms covers recordClose (1000ms) + right transition (400ms delay + 600ms = 1000ms)
    // Open → full: 600ms covers recordOpen (500ms) + right transition (500ms)
    const transTimeout = compactMode ? 1050 : 600;
    setTimeout(() => {
      if (widgetEl) widgetEl.dataset.transitioning = 'false';
      isTransitioning = false;
    }, transTimeout);
  } else {
    isTransitioning = false;
  }
}

function setWidgetInteractive(interactive) {
  ipcRenderer.send('overlay:hover-widget', !!interactive);
}

function isMouseOverWidget(x, y) {
  if (!widgetEl) return false;
  const rect = widgetEl.getBoundingClientRect();
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

function clampWidgetPosition(x, y) {
  if (!widgetEl) return { x, y };
  const rect = widgetEl.getBoundingClientRect();
  const maxX = Math.max(0, window.innerWidth - rect.width);
  const maxY = Math.max(0, window.innerHeight - rect.height);
  return {
    x: Math.min(maxX, Math.max(0, x)),
    y: Math.min(maxY, Math.max(0, y))
  };
}

function onWidgetMouseDown(ev) {
  if (!widgetEl || ev.button !== 0) return;
  if (ev.target instanceof Element && ev.target.closest('#sourceKnob, #sourceVolumeGlass, #volumeBtnGlass, #volumePopup, #miniControls button, #miniArtWrap, #miniArt, #miniSpectrum')) return;
  const rect = widgetEl.getBoundingClientRect();
  pointerDown = true;
  pointerDownX = ev.clientX;
  pointerDownY = ev.clientY;
  if (currentView === 'mini-lid' && ev.target instanceof Element) {
    const onHoverControls = !!ev.target.closest('#miniControls button, #glassMenuBtn, #glassQuickMenu, #quickMini, #quickSettings, #pinBtn');
    pendingToggleClick = !onHoverControls;
  } else {
    pendingToggleClick = !isTextTarget(ev.target);
  }
  dragState.offsetX = ev.clientX - rect.left;
  dragState.offsetY = ev.clientY - rect.top;
  dragging = false;
  widgetEl.dataset.dragging = 'false';
  setWidgetInteractive(true);
  ev.preventDefault();
}

function onWidgetMouseMove(ev) {
  lastMouseX = ev.clientX;
  lastMouseY = ev.clientY;
  const hovering = isMouseOverWidget(lastMouseX, lastMouseY);
  if (hovering !== isHoveringWidget && !dragging) {
    isHoveringWidget = hovering;
    setWidgetInteractive(isHoveringWidget);
  }

  // Corner-hover pin reveal
  if (widgetEl && !pointerDown) {
    const rect = widgetEl.getBoundingClientRect();
    const inCorner = hovering
      && ev.clientX >= rect.right - PIN_CORNER_PX
      && ev.clientY <= rect.top + PIN_CORNER_PX;
    if (inCorner && !isPinned) {
      if (!pinHoverTimer) {
        pinHoverTimer = setTimeout(() => {
          if (widgetEl) widgetEl.dataset.pinHint = 'true';
          pinHoverTimer = null;
        }, 1800);
      }
    } else {
      if (pinHoverTimer) { clearTimeout(pinHoverTimer); pinHoverTimer = null; }
      if (widgetEl.dataset.pinHint === 'true' && !isPinned) widgetEl.dataset.pinHint = 'false';
    }

    // Bottom-right resize corner
    const inResizeCorner = hovering
      && ev.clientX >= rect.right - RESIZE_CORNER_PX
      && ev.clientY >= rect.bottom - RESIZE_CORNER_PX;
    const resizeHint = String(inResizeCorner);
    if (widgetEl.dataset.resizeHint !== resizeHint) widgetEl.dataset.resizeHint = resizeHint;
  }

  if (!pointerDown || !widgetEl) return;

  const dx = ev.clientX - pointerDownX;
  const dy = ev.clientY - pointerDownY;
  const moved = Math.hypot(dx, dy);

  if (!dragging && moved >= DRAG_THRESHOLD) {
    if (isPinned) return;
    const rect = widgetEl.getBoundingClientRect();
    widgetEl.style.left = `${rect.left}px`;
    widgetEl.style.top = `${rect.top}px`;
    widgetEl.style.right = 'auto';
    dragging = true;
    pendingToggleClick = false;
    widgetEl.dataset.dragging = 'true';
  }

  if (!dragging) return;
  const targetX = ev.clientX - dragState.offsetX;
  const targetY = ev.clientY - dragState.offsetY;
  const pos = clampWidgetPosition(targetX, targetY);
  widgetEl.style.left = `${pos.x}px`;
  widgetEl.style.top = `${pos.y}px`;
}

function onWidgetMouseUp(ev) {
  if (!widgetEl) return;
  const wasPointerDown = pointerDown;
  pointerDown = false;

  if (dragging) dragging = false;
  widgetEl.dataset.dragging = 'false';

  const upX = ev ? ev.clientX : lastMouseX;
  const upY = ev ? ev.clientY : lastMouseY;
  lastMouseX = upX;
  lastMouseY = upY;
  const moved = Math.hypot(upX - pointerDownX, upY - pointerDownY);
  if (suppressNextWidgetToggle) {
    suppressNextWidgetToggle = false;
    pendingToggleClick = false;
    isHoveringWidget = isMouseOverWidget(upX, upY);
    setWidgetInteractive(isHoveringWidget);
    return;
  }
  if (wasPointerDown && pendingToggleClick && moved < DRAG_THRESHOLD) {
    if (currentView === 'mini-lid') {
      setCurrentView('mini');
      applyWidgetSize();
    } else {
      toggleCompactMode();
    }
  }

  pendingToggleClick = false;
  isHoveringWidget = isMouseOverWidget(upX, upY);
  setWidgetInteractive(isHoveringWidget);
}

function onResizeHandleMouseDown(ev) {
  if (ev.button !== 0) return;
  if (!widgetEl) return;
  const rect = widgetEl.getBoundingClientRect();
  resizeStartX = ev.clientX;
  resizeStartWidth = rect.width;
  resizing = true;
  setWidgetInteractive(true);
  ev.preventDefault();
  ev.stopPropagation();
}

function onResizeHandleMouseMove(ev) {
  if (!resizing || !widgetEl) return;
  const delta = ev.clientX - resizeStartX;
  const desiredW = resizeStartWidth + delta;
  const ratio = clampScale(desiredW / uiState.baseWidth);
  if (Math.abs(ratio - uiState.scale) < 0.001) return;
  uiState.scale = ratio;
  if (scaleSliderEl) scaleSliderEl.value = String(Math.round(ratio * 100));
  applyWidgetSize();
  updateGlassSpectrumGeometry(true);
}

function onResizeHandleMouseUp() {
  if (!resizing) return;
  resizing = false;
  setWidgetInteractive(isMouseOverWidget(lastMouseX, lastMouseY));
}

function onSettingsButtonClick(ev) {
  ev.preventDefault();
  ev.stopPropagation();
  setSettingsOpen(!settingsOpen);
  setQuickMenuOpen(false);
}

function onGlassMenuClick(ev) {
  ev.preventDefault();
  ev.stopPropagation();
  setQuickMenuOpen(!quickMenuOpen);
}

function onPinButtonClick(ev) {
  ev.preventDefault();
  ev.stopPropagation();
  isPinned = !isPinned;
  if (widgetEl) {
    widgetEl.dataset.pinned = String(isPinned);
    if (isPinned) {
      // Lock current position so it won't snap on first drag attempt
      const rect = widgetEl.getBoundingClientRect();
      widgetEl.style.left = `${rect.left}px`;
      widgetEl.style.top = `${rect.top}px`;
      widgetEl.style.right = 'auto';
      widgetEl.dataset.pinHint = 'false';
    }
  }
  if (pinBtnEl) pinBtnEl.setAttribute('aria-pressed', String(isPinned));
}

function onQuickMiniClick(ev) {
  ev.preventDefault();
  ev.stopPropagation();
  const next = (currentView === 'mini' || currentView === 'mini-lid') ? 'full' : 'mini';
  setCurrentView(next);
  applyWidgetSize();
  setQuickMenuOpen(false);
}

function onQuickSettingsClick(ev) {
  ev.preventDefault();
  ev.stopPropagation();
  setQuickMenuOpen(false);
  setSettingsOpen(true);
}

function onThemeChanged(ev) {
  applyTheme(ev && ev.target ? ev.target.value : 'light');
}

function onScaleChanged(ev) {
  const raw = Number(ev && ev.target ? ev.target.value : 100);
  uiState.scale = clampScale((Number.isFinite(raw) ? raw : 100) / 100);
  applyWidgetSize();
  updateGlassSpectrumGeometry(true);
}

function onClearGlassChanged(ev) {
  const on = !!(ev && ev.target && ev.target.checked);
  applyGlassClarity(on);
}

async function onLaunchToggleChanged(ev) {
  const on = !!(ev && ev.target && ev.target.checked);
  try {
    const ok = await ipcRenderer.invoke('settings:launch-on-start:set', on);
    if (!ok) throw new Error('launch setting update failed');
    const confirmed = await ipcRenderer.invoke('settings:launch-on-start:get');
    if (launchToggleEl) launchToggleEl.checked = !!confirmed;
  } catch {
    try {
      const current = await ipcRenderer.invoke('settings:launch-on-start:get');
      if (launchToggleEl) launchToggleEl.checked = !!current;
    } catch {
      if (launchToggleEl) launchToggleEl.checked = !on;
    }
  }
}

async function onCloseAppClick(ev) {
  if (ev) {
    ev.preventDefault();
    ev.stopPropagation();
  }
  try {
    await ipcRenderer.invoke('app:close');
  } catch {
    window.close();
  }
}

function onMiniModeToggle(ev) {
  const on = !!(ev && ev.target && ev.target.checked);
  const next = on ? 'mini' : 'full';
  setCurrentView(next);
  applyWidgetSize();
}

async function loadLaunchSetting() {
  if (!launchToggleEl) return;
  try {
    const enabled = await ipcRenderer.invoke('settings:launch-on-start:get');
    launchToggleEl.checked = !!enabled;
  } catch {
    launchToggleEl.checked = false;
  }
}

applyTheme(uiState.theme);
applyGlassClarity(uiState.clearGlass);
setCurrentView('full');
applyWidgetSize();
if (frameEl) frameEl.style.height = `${cfg.widget.barsHeight}px`;
if (widgetEl) {
  widgetEl.dataset.draggable = 'true';
  widgetEl.dataset.dragging = 'false';
  widgetEl.dataset.transitioning = 'false';
  widgetEl.dataset.pinHint = 'false';
  widgetEl.dataset.pinned = 'false';
  widgetEl.dataset.resizeHint = 'false';
  widgetEl.addEventListener('mousedown', onWidgetMouseDown);
}
bindMetadataLinks();
bindTransportControls();
if (sourceKnobEl) {
  sourceKnobEl.addEventListener('mousedown', onSourceKnobMouseDown);
  sourceKnobEl.addEventListener('wheel', onSourceKnobWheel, { passive: false });
}
if (sourceVolumeGlassEl) {
  sourceVolumeGlassEl.addEventListener('input', onSourceVolumeGlassInput);
  sourceVolumeGlassEl.addEventListener('change', onSourceVolumeGlassCommit);
  sourceVolumeGlassEl.addEventListener('wheel', onSourceVolumeGlassWheel, { passive: false });
}
if (volumeBtnGlassEl) {
  volumeBtnGlassEl.addEventListener('click', onVolumeButtonGlassClick);
}
if (btnSettingsEl) {
  btnSettingsEl.addEventListener('click', onSettingsButtonClick);
}
if (glassMenuBtnEl) {
  glassMenuBtnEl.addEventListener('click', onGlassMenuClick);
}
if (pinBtnEl) {
  pinBtnEl.addEventListener('click', onPinButtonClick);
}
if (quickMiniEl) {
  quickMiniEl.addEventListener('click', onQuickMiniClick);
}
if (quickSettingsEl) {
  quickSettingsEl.addEventListener('click', onQuickSettingsClick);
}
if (themeSelectEl) {
  themeSelectEl.value = uiState.theme;
  themeSelectEl.addEventListener('change', onThemeChanged);
}
if (scaleSliderEl) {
  scaleSliderEl.value = String(Math.round(uiState.scale * 100));
  scaleSliderEl.addEventListener('input', onScaleChanged);
}
if (clearGlassToggleEl) {
  clearGlassToggleEl.checked = true;
  clearGlassToggleEl.addEventListener('change', onClearGlassChanged);
}
if (launchToggleEl) {
  launchToggleEl.addEventListener('change', onLaunchToggleChanged);
}
if (miniModeToggleEl) {
  miniModeToggleEl.checked = false;
  miniModeToggleEl.addEventListener('change', onMiniModeToggle);
}
if (btnCloseAppEl) {
  btnCloseAppEl.addEventListener('click', onCloseAppClick);
}
if (resizeHandleEl) {
  resizeHandleEl.addEventListener('mousedown', onResizeHandleMouseDown);
}
if (miniPaneEl) {
  miniPaneEl.addEventListener('dblclick', (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    if (currentView === 'mini') setCurrentView('mini-lid');
    else if (currentView === 'mini-lid') setCurrentView('mini');
    applyWidgetSize();
  });
}
if (miniArtWrapEl) {
  miniArtWrapEl.addEventListener('mousedown', (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    if (currentView !== 'mini') return;
    suppressNextWidgetToggle = true;
    setCurrentView('mini-lid');
    applyWidgetSize();
  });
}
if (miniArtEl) {
  miniArtEl.draggable = false;
}
loadLaunchSetting();
loadSystemVolume();
window.addEventListener('mousemove', onWidgetMouseMove);
window.addEventListener('mousemove', onSourceKnobMouseMove);
window.addEventListener('mousemove', onResizeHandleMouseMove);
window.addEventListener('mouseup', onWidgetMouseUp);
window.addEventListener('mouseup', onSourceKnobMouseUp);
window.addEventListener('mouseup', onResizeHandleMouseUp);
window.addEventListener('blur', () => {
  // Safety: release all drag/resize state if the window loses focus
  if (resizing) { resizing = false; setWidgetInteractive(false); }
  if (pointerDown) { pointerDown = false; dragging = false; if (widgetEl) widgetEl.dataset.dragging = 'false'; }
});
window.addEventListener('mousedown', (ev) => {
  const target = ev.target;
  if (!(target instanceof Element)) return;
  if (settingsOpen && !target.closest('#settingsPanel, #btnSettings, #quickSettings')) {
    setSettingsOpen(false);
  }
  if (quickMenuOpen && !target.closest('#glassQuickMenu, #glassMenuBtn')) {
    setQuickMenuOpen(false);
  }
});
setWidgetInteractive(false);

function detectAudioActive(freqData, state, cfg) {
  const n = Math.min(freqData.length, cfg.activity.sampleBins);
  let sum = 0;
  for (let i = 0; i < n; i++) sum += freqData[i];
  const level = (sum / n) / 255;

  if (level >= cfg.activity.threshold) {
    state.hotFrames += 1;
    state.coldFrames = 0;
  } else {
    state.coldFrames += 1;
    state.hotFrames = 0;
  }

  if (!state.active && state.hotFrames >= cfg.activity.attackFrames) state.active = true;
  if (state.active && state.coldFrames >= cfg.activity.releaseFrames) state.active = false;

  return { active: state.active, level };
}

function setStatus(active, level) {
  if (!statusEl) return;
  const pct = Math.round(level * 100);
  statusEl.textContent = active ? `AUDIO ACTIVE ${pct}%` : `LISTENING ${pct}%`;
  statusEl.dataset.state = active ? 'active' : 'idle';
  if (widgetEl) widgetEl.dataset.state = active ? 'active' : 'idle';
}

function updateArcMotion(freqData, state, active, level) {
  if (!rightPaneEl) return;

  const bassBins = Math.min(freqData.length, 44);
  let bassSum = 0;
  for (let i = 0; i < bassBins; i++) bassSum += freqData[i];
  const bassNow = bassBins > 0 ? (bassSum / bassBins) / 255 : 0;

  state.bass = state.bass * 0.9 + bassNow * 0.1;
  const transient = Math.max(0, bassNow - state.bass);
  const targetPulse = active ? (state.bass * 0.65 + transient * 0.75 + level * 0.08) : 0;
  state.pulse = state.pulse * 0.9 + targetPulse * 0.1;

  const bounce = clamp(state.pulse * 8 + state.bass * 3, 0, 8);
  const spread = clamp(state.pulse * 0.1 + state.bass * 0.04, 0, 0.12);
  const shift = clamp(state.pulse * 6 + state.bass * 2.5, 0, 7);
  const opacity = clamp(0.44 + state.pulse * 0.14 + state.bass * 0.06, 0.42, 0.62);

  rootStyle.setProperty('--arc-bounce-y', (bounce / 100).toFixed(3));
  rootStyle.setProperty('--arc-spread', spread.toFixed(3));
  rootStyle.setProperty('--arc-shift-x', `${shift.toFixed(2)}px`);
  rootStyle.setProperty('--arc-opacity', opacity.toFixed(3));
}

function updateGlassSpectrumGeometry(force = false) {
  if (!glassSpectrumEl || !widgetEl || !recordEl || !spectrumState.ctx) return;

  const rect = glassSpectrumEl.getBoundingClientRect();
  if (rect.width < 2 || rect.height < 2) return;
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  const width = Math.max(1, Math.round(rect.width * dpr));
  const height = Math.max(1, Math.round(rect.height * dpr));
  if (force || spectrumState.width !== width || spectrumState.height !== height || spectrumState.dpr !== dpr) {
    glassSpectrumEl.width = width;
    glassSpectrumEl.height = height;
    spectrumState.width = width;
    spectrumState.height = height;
    spectrumState.dpr = dpr;
  }

  const canvasRect = glassSpectrumEl.getBoundingClientRect();
  const recordRect = recordEl.getBoundingClientRect();
  const centerX = ((recordRect.left + recordRect.width * 0.5) - canvasRect.left) * dpr;
  const centerY = ((recordRect.top + recordRect.height * 0.5) - canvasRect.top) * dpr;
  const recordRadius = Math.max(24, recordRect.width * 0.5 * dpr);

  const geomStamp = `${Math.round(centerX)}:${Math.round(centerY)}:${Math.round(recordRadius)}:${width}:${height}`;
  if (force || geomStamp !== spectrumState.geomStamp) {
    spectrumState.centerX = centerX;
    spectrumState.centerY = centerY;
    spectrumState.recordRadius = recordRadius;
    spectrumState.geomStamp = geomStamp;
  }
}

function renderGlassSpectrum(freqData, active, level) {
  if (!glassSpectrumEl || !spectrumState.ctx) return;

  const view = currentView || (widgetEl && widgetEl.dataset.view) || 'full';
  const lidMode = view === 'lid';
  if (!lidMode) {
    if (spectrumState.width > 0 && spectrumState.height > 0) {
      spectrumState.ctx.clearRect(0, 0, spectrumState.width, spectrumState.height);
    }
    return;
  }

  updateGlassSpectrumGeometry();
  const ctx = spectrumState.ctx;
  const { width, height, centerX, centerY, recordRadius, levels } = spectrumState;
  if (width < 2 || height < 2 || recordRadius < 2) return;

  const dpr = spectrumState.dpr;
  ctx.clearRect(0, 0, width, height);

  const bars = levels.length; // 64
  const halfBars = bars / 2;
  const freqMax = Math.max(16, Math.floor(freqData.length * 0.72));

  // Idle breathing animation
  spectrumState.idlePhase += 0.016;

  // ── Bass pulse ring ────────────────────────────────────────────────────────
  const bassBins = Math.min(10, freqData.length);
  let bassSum = 0;
  for (let b = 0; b < bassBins; b++) bassSum += freqData[b];
  const bassNow = clamp(bassSum / bassBins / 255, 0, 1);
  spectrumState.bass = spectrumState.bass * 0.84 + bassNow * 0.16;
  const br = spectrumState.bass;
  const ringAlpha = clamp(0.2 + br * 0.42, 0.16, 0.62);
  const ringR = recordRadius + (1 + br * 4) * dpr;
  ctx.beginPath();
  ctx.arc(centerX, centerY, ringR, 0, Math.PI * 2);
  ctx.strokeStyle = `rgba(126, 209, 255, ${ringAlpha.toFixed(3)})`;
  ctx.lineWidth = (1.2 + br * 3) * dpr;
  ctx.shadowColor = `rgba(96, 198, 255, ${(ringAlpha * 0.85).toFixed(3)})`;
  ctx.shadowBlur = (6 + br * 18) * dpr;
  ctx.stroke();
  ctx.shadowBlur = 0;

  // Rotating concentric ring lattice so the effect remains on-glass even when bars are subtle.
  const ringCount = 3;
  const baseRot = spectrumState.idlePhase * (0.8 + br * 0.9);
  for (let r = 0; r < ringCount; r++) {
    const rr = recordRadius + (7 + r * 8 + Math.sin(spectrumState.idlePhase * (1.1 + r * 0.23)) * (0.9 + br * 1.8)) * dpr;
    const segs = 72;
    const a0 = baseRot * (r % 2 === 0 ? 1 : -1) + r * 0.8;
    const aAlpha = clamp(0.16 + br * 0.26 - r * 0.03, 0.08, 0.38);

    ctx.beginPath();
    for (let s = 0; s <= segs; s++) {
      const t = s / segs;
      const a = a0 + t * Math.PI * 2;
      const wobble = Math.sin(a * (2 + r) + spectrumState.idlePhase * (1.4 + r * 0.2)) * (0.7 + br * 1.8) * dpr;
      const x = centerX + Math.cos(a) * (rr + wobble);
      const y = centerY + Math.sin(a) * (rr + wobble);
      if (s === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.lineWidth = (0.9 + r * 0.18) * dpr;
    ctx.strokeStyle = `rgba(${r === 1 ? '78, 187, 255' : '97, 226, 241'}, ${aAlpha.toFixed(3)})`;
    ctx.stroke();
  }

  // ── 360° symmetric radial bars ─────────────────────────────────────────────
  const baseGap = 4 * dpr;
  const maxBarLen = 24 * dpr;

  for (let i = 0; i < bars; i++) {
    // Symmetric: both halves mirror each other around the top (–PI/2)
    const half = i < halfBars ? i : bars - 1 - i;
    const norm = half / (halfBars - 1);          // 0 = top, 1 = bottom
    const side = i < halfBars ? 1 : -1;
    const angle = -Math.PI / 2 + side * norm * Math.PI;

    // Log-curved frequency mapping (more detail in lows)
    const t = Math.pow(norm, 0.8);
    const bin = Math.min(freqData.length - 1, Math.floor(1 + t * (freqMax - 1)));
    const raw = clamp(freqData[bin] / 255, 0, 1);
    const idleTarget = (0.055 + Math.sin(spectrumState.idlePhase + norm * Math.PI * 2) * 0.02) * (1 - norm * 0.3);
    const target = active ? raw * 0.95 : idleTarget;
    const resp = target > levels[i] ? 0.26 : 0.11;
    levels[i] += (target - levels[i]) * resp;

    const amp = Math.pow(levels[i], 0.64);
    const r1 = recordRadius + baseGap;
    const r2 = recordRadius + baseGap + amp * maxBarLen;
    const x1 = centerX + Math.cos(angle) * r1;
    const y1 = centerY + Math.sin(angle) * r1;
    const x2 = centerX + Math.cos(angle) * r2;
    const y2 = centerY + Math.sin(angle) * r2;

    // Glass gradient: opaque white-blue base → transparent tip
    const grad = ctx.createLinearGradient(x1, y1, x2, y2);
    const baseA = clamp(0.48 + amp * 0.40, 0.38, 0.90);
    const tipA  = clamp(amp * 0.18, 0, 0.24);
    const col   = active ? '132, 222, 255' : '92, 184, 234';
    grad.addColorStop(0, `rgba(${col}, ${baseA.toFixed(3)})`);
    grad.addColorStop(1, `rgba(${col}, ${tipA.toFixed(3)})`);

    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.lineWidth = clamp((0.9 + amp * 1.8) * dpr, 0.8 * dpr, 3.2 * dpr);
    ctx.lineCap = 'round';
    ctx.strokeStyle = grad;
    ctx.stroke();
  }
}

function renderMiniSpectrum(freqData, active) {
  if (!miniSpectrumState.ctx || !miniSpectrumEl || !miniArtEl) return;
  if (currentView !== 'mini' && currentView !== 'mini-lid') {
    if (miniSpectrumState.width > 0 && miniSpectrumState.height > 0) {
      miniSpectrumState.ctx.clearRect(0, 0, miniSpectrumState.width, miniSpectrumState.height);
    }
    return;
  }

  const rect = miniSpectrumEl.getBoundingClientRect();
  if (rect.width < 2 || rect.height < 2) return;
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  const width = Math.max(1, Math.round(rect.width * dpr));
  const height = Math.max(1, Math.round(rect.height * dpr));
  if (miniSpectrumState.width !== width || miniSpectrumState.height !== height || miniSpectrumState.dpr !== dpr) {
    miniSpectrumEl.width = width;
    miniSpectrumEl.height = height;
    miniSpectrumState.width = width;
    miniSpectrumState.height = height;
    miniSpectrumState.dpr = dpr;
  }

  const ctx = miniSpectrumState.ctx;
  ctx.clearRect(0, 0, width, height);
  miniSpectrumState.phase += 0.02;

  const levels = miniSpectrumState.levels;
  const bars = levels.length;
  const span = width * 0.86;
  const startX = (width - span) * 0.5;
  const w = span / bars;
  const baseline = height * 0.88;
  const maxH = height * 0.45;

  for (let i = 0; i < bars; i++) {
    const t = i / Math.max(1, bars - 1);
    const bin = Math.min(freqData.length - 1, Math.floor(Math.pow(t, 0.82) * (freqData.length * 0.58)));
    const raw = clamp(freqData[bin] / 255, 0, 1);
    const idle = 0.03 + Math.sin(miniSpectrumState.phase + i * 0.26) * 0.015;
    const target = active ? raw : idle;
    const rate = target > levels[i] ? 0.32 : 0.12;
    levels[i] += (target - levels[i]) * rate;
    const amp = Math.pow(levels[i], 0.72);
    const h = Math.max(1 * dpr, amp * maxH);

    const x = startX + i * w;
    const grad = ctx.createLinearGradient(x, baseline - h, x, baseline);
    grad.addColorStop(0, 'rgba(202, 238, 255, 0.85)');
    grad.addColorStop(1, 'rgba(120, 174, 233, 0.18)');
    ctx.fillStyle = grad;
    ctx.fillRect(x, baseline - h, Math.max(1, w * 0.68), h);
  }
}

function updatePlaybackProgress(nowMs) {
  if (!miniProgressFillEl) return;
  if (playbackProgressState.playing) {
    const dt = Math.max(0, nowMs - playbackProgressState.lastTickMs);
    playbackProgressState.positionMs += dt;
  }
  playbackProgressState.lastTickMs = nowMs;
  const duration = Math.max(1, playbackProgressState.durationMs || (3 * 60 * 1000));
  playbackProgressState.positionMs = clamp(playbackProgressState.positionMs, 0, duration);
  const pct = clamp((playbackProgressState.positionMs / duration) * 100, 0, 100);
  miniProgressFillEl.style.width = `${pct.toFixed(2)}%`;

  const trackT = clamp(pct / 100, 0, 1);
  const sway = Math.sin(nowMs / 430) * (currentMeta.playbackStatus === 'playing' ? 0.9 : 0.25);
  rootStyle.setProperty('--tonearm-track', trackT.toFixed(4));
  rootStyle.setProperty('--tonearm-sway', `${sway.toFixed(2)}deg`);
}

function setMetadata(meta) {
  const prevTrackKey = playbackProgressState.trackKey;
  currentMeta = {
    appId: meta.appId || '',
    title: meta.title || '',
    artist: meta.artist || '',
    album: meta.album || '',
    artwork: meta.artwork || '',
    playbackStatus: (meta.playbackStatus || 'paused').toLowerCase(),
    durationMs: Number.isFinite(meta.durationMs) ? Math.max(0, Number(meta.durationMs)) : 0,
    positionMs: Number.isFinite(meta.positionMs) ? Math.max(0, Number(meta.positionMs)) : 0,
    controls: {
      canPlay: meta.controls ? meta.controls.canPlay !== false : true,
      canPause: meta.controls ? meta.controls.canPause !== false : true,
      canSkipNext: meta.controls ? meta.controls.canSkipNext !== false : true,
      canSkipPrevious: meta.controls ? meta.controls.canSkipPrevious !== false : true
    }
  };

  if (artistEl) artistEl.textContent = meta.artist || 'Unknown Artist';
  if (albumTextEl) albumTextEl.textContent = meta.album ? `Album: ${meta.album}` : 'Album unknown';
  else if (albumEl) albumEl.textContent = meta.album ? `Album: ${meta.album}` : 'Album unknown';
  if (titleEl) titleEl.textContent = meta.title || 'Unknown Track';
  if (glassTitleEl) glassTitleEl.textContent = meta.title || 'Unknown Track';
  if (glassArtistEl) glassArtistEl.textContent = meta.artist || 'Unknown Artist';
  if (glassAlbumEl) glassAlbumEl.textContent = meta.album || 'Album unknown';
  if (miniTitleEl) miniTitleEl.textContent = meta.title || 'Unknown Track';
  if (miniArtistEl) miniArtistEl.textContent = meta.artist || 'Unknown Artist';
  updateVolumeUiSource(currentMeta);
  updateTransportUi(currentMeta);
  if (labelTitleEl) labelTitleEl.textContent = fitLabelText(meta.title || 'Unknown Track', 16);
  if (labelArtistEl) labelArtistEl.textContent = fitLabelText(meta.artist || 'Unknown Artist', 16);
  applyRecordLabelTheme(meta);
  if (sleeveArtEl) {
    if (meta.artwork) sleeveArtEl.src = meta.artwork;
    else sleeveArtEl.removeAttribute('src');
  }
  if (recordArtEl) {
    if (meta.artwork) recordArtEl.src = meta.artwork;
    else recordArtEl.removeAttribute('src');
  }
  if (miniArtEl) {
    if (meta.artwork) miniArtEl.src = meta.artwork;
    else miniArtEl.removeAttribute('src');
  }

  const trackKey = `${currentMeta.appId}|${currentMeta.title}|${currentMeta.artist}`;
  playbackProgressState.trackKey = trackKey;
  playbackProgressState.playing = currentMeta.playbackStatus === 'playing';
  playbackProgressState.lastTickMs = performance.now();

  // If metadata does not provide timeline data, use a soft default duration.
  const fallbackDuration = 3 * 60 * 1000;
  const duration = currentMeta.durationMs > 0 ? currentMeta.durationMs : fallbackDuration;
  const position = clamp(currentMeta.positionMs || 0, 0, duration);
  playbackProgressState.durationMs = duration;
  playbackProgressState.positionMs = position;

  if (prevTrackKey && prevTrackKey !== trackKey && recordEl) {
    recordEl.dataset.transition = 'burn';
    setTimeout(() => {
      if (recordEl) recordEl.dataset.transition = 'none';
    }, 940);
  }

  // Adapt record label line contrast based on current inferred theme brightness.
  const isDarkTheme = uiState.theme === 'dark' || uiState.theme === 'transparent';
  rootStyle.setProperty('--label-panel-rgb', isDarkTheme ? '230, 238, 248' : '255, 248, 216');

  updateAlbumMarqueeState();
}

async function startMetadataBridge() {
  setMetadata({ artist: 'Waiting for media', album: '', title: 'Desktop audio session', artwork: '' });
  try {
    const initial = await ipcRenderer.invoke('media-meta:get');
    if (initial) {
      setMetadata({
        appId: initial.appId || '',
        artist: initial.artist || 'Unknown Artist',
        album: initial.album || '',
        title: initial.title || 'Unknown Track',
        artwork: initial.artwork || '',
        playbackStatus: initial.playbackStatus || 'paused',
        durationMs: initial.durationMs,
        positionMs: initial.positionMs,
        controls: initial.controls || {}
      });
    }
  } catch {}

  ipcRenderer.on('media-meta', (_, meta) => {
    if (!meta) {
      setMetadata({ artist: 'Waiting for media', album: '', title: 'Desktop audio session', artwork: '' });
      return;
    }

    setMetadata({
      appId: meta.appId || '',
      artist: meta.artist || 'Unknown Artist',
      album: meta.album || '',
      title: meta.title || 'Unknown Track',
      artwork: meta.artwork || '',
      playbackStatus: meta.playbackStatus || 'paused',
      durationMs: meta.durationMs,
      positionMs: meta.positionMs,
      controls: meta.controls || {}
    });
  });
}

async function start() {
  try {
    await startMetadataBridge();
    const audio = await initAudio(cfg);
    const { renderer, scene, camera, resize } = initRenderer();
    const update = initVisualizer(scene, audio, cfg);
    const detector = { active: false, hotFrames: 0, coldFrames: 0 };
    const arcMotion = { bass: 0, pulse: 0 };
    window.addEventListener('resize', () => {
      applyWidgetSize();
      updateAlbumMarqueeState();
      updateGlassSpectrumGeometry(true);
      resize();
    });

    ipcRenderer.send('audio-started');

    function loop() {
      requestAnimationFrame(loop);
      const freq = audio.getFreq();
      const time = audio.getTime();
      const now = performance.now();
      const { active, level } = detectAudioActive(freq, detector, cfg);
      setStatus(active, level);
      updateArcMotion(freq, arcMotion, active, level);
      renderGlassSpectrum(freq, active, level);
      renderMiniSpectrum(freq, active);
      updatePlaybackProgress(now);
      update(freq, time);
      renderer.render(scene, camera);
    }
    loop();
  } catch (err) {
    console.error(err);
    document.body.insertAdjacentHTML('beforeend',
      `<div style="position:fixed;bottom:20px;left:20px;color:#ff4444;
        font-family:monospace;font-size:12px;background:rgba(0,0,0,0.7);
        padding:10px;border:1px solid #ff4444;">
        Error: ${err.message}
      </div>`
    );
  }
}

start();
