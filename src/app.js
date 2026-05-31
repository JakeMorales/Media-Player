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
const rightPaneEl = document.getElementById('rightPane');
const sleeveArtEl = document.getElementById('sleeveArt');
const recordArtEl = document.getElementById('recordArt');
const labelTitleEl = document.getElementById('labelTitle');
const labelArtistEl = document.getElementById('labelArtist');
const rootStyle = document.documentElement.style;
let dragging = false;
let pointerDown = false;
let compactMode = false;
let pendingToggleClick = false;
let pointerDownX = 0;
let pointerDownY = 0;
let isHoveringWidget = false;
let lastMouseX = 0;
let lastMouseY = 0;
const dragState = { offsetX: 0, offsetY: 0 };
const DRAG_THRESHOLD = 6;
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
  controls: { canPlay: true, canPause: true, canSkipNext: true, canSkipPrevious: true }
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

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
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
  const btns = [btnPrevEl, btnPlayPauseEl, btnNextEl, btnPrevGlassEl, btnPlayPauseGlassEl, btnNextGlassEl];
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
  const baseW = Math.min(cfg.widget.width, maxW);
  const baseH = Math.round(baseW / 2);
  const w = compactMode ? Math.round(baseW * 0.5) : baseW;
  const h = baseH;
  widgetEl.style.width = `${w}px`;
  widgetEl.style.height = `${h}px`;
}

function isTextTarget(target) {
  if (!(target instanceof Element)) return false;
  return !!target.closest('#title, #artist, #album, #glassTitle, #glassArtist, #glassAlbum, #sourceKnob, #sourceVolumeGlass, #volumeBtnGlass, #volumePopup, #btnPrev, #btnPlayPause, #btnNext, #btnPrevGlass, #btnPlayPauseGlass, #btnNextGlass, #labelTitle, #labelArtist, #labelTopText, #labelCatalog, #labelSideText');
}

function toggleCompactMode() {
  compactMode = !compactMode;
  if (widgetEl) widgetEl.dataset.view = compactMode ? 'lid' : 'full';
  applyWidgetSize();
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
  if (ev.target instanceof Element && ev.target.closest('#sourceKnob, #sourceVolumeGlass, #volumeBtnGlass, #volumePopup')) return;
  const rect = widgetEl.getBoundingClientRect();
  pointerDown = true;
  pointerDownX = ev.clientX;
  pointerDownY = ev.clientY;
  pendingToggleClick = !isTextTarget(ev.target);
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

  if (!pointerDown || !widgetEl) return;

  const dx = ev.clientX - pointerDownX;
  const dy = ev.clientY - pointerDownY;
  const moved = Math.hypot(dx, dy);

  if (!dragging && moved >= DRAG_THRESHOLD) {
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
  if (wasPointerDown && pendingToggleClick && moved < DRAG_THRESHOLD) {
    toggleCompactMode();
  }

  pendingToggleClick = false;
  isHoveringWidget = isMouseOverWidget(upX, upY);
  setWidgetInteractive(isHoveringWidget);
}

applyWidgetSize();
if (frameEl) frameEl.style.height = `${cfg.widget.barsHeight}px`;
if (widgetEl) {
  widgetEl.dataset.draggable = 'true';
  widgetEl.dataset.dragging = 'false';
  widgetEl.dataset.view = 'full';
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
loadSystemVolume();
window.addEventListener('mousemove', onWidgetMouseMove);
window.addEventListener('mousemove', onSourceKnobMouseMove);
window.addEventListener('mouseup', onWidgetMouseUp);
window.addEventListener('mouseup', onSourceKnobMouseUp);
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

function setMetadata(meta) {
  currentMeta = {
    appId: meta.appId || '',
    title: meta.title || '',
    artist: meta.artist || '',
    album: meta.album || '',
    artwork: meta.artwork || '',
    playbackStatus: (meta.playbackStatus || 'paused').toLowerCase(),
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
      resize();
    });

    ipcRenderer.send('audio-started');

    function loop() {
      requestAnimationFrame(loop);
      const freq = audio.getFreq();
      const time = audio.getTime();
      const { active, level } = detectAudioActive(freq, detector, cfg);
      setStatus(active, level);
      updateArcMotion(freq, arcMotion, active, level);
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
