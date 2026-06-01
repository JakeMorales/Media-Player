const cfg            = require('./config');
const { initAudio }      = require('./audio');
const { initRenderer }   = require('./renderer');
const { initVisualizer } = require('./visualizer');
const { ipcRenderer, shell }    = require('electron');

const labelTheme     = require('./label-theme');
const artTransition  = require('./art-transition');
const spectrumCanvas = require('./spectrum-canvas');
const volumeControl  = require('./volume-control');
const transport      = require('./transport');

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
const sleeveArtNewEl = document.getElementById('sleeveArtNew');
const recordArtEl = document.getElementById('recordArt');
const recordArtNewEl = document.getElementById('recordArtNew');
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
let resizeStartY = 0;
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
  if (themeSelectEl) {
    themeSelectEl.querySelectorAll('.themePill').forEach(pill => {
      pill.classList.toggle('active', pill.dataset.value === theme);
    });
  }
}

function applyGlassClarity(enabled) {
  uiState.clearGlass = !!enabled;
  rootStyle.setProperty('--glass-clarity', enabled ? '0.28' : '0.72');
}

function saveSettings() {
  try {
    const isMini = currentView === 'mini' || currentView === 'mini-lid';
    localStorage.setItem('mp_theme', uiState.theme);
    localStorage.setItem('mp_scale', String(uiState.scale));
    localStorage.setItem('mp_clearGlass', String(uiState.clearGlass));
    localStorage.setItem('mp_miniMode', String(isMini));
  } catch {}
}

function loadSettings() {
  try {
    const theme = localStorage.getItem('mp_theme');
    const validThemes = ['light', 'dark', 'cream', 'pastel', 'transparent'];
    if (theme && validThemes.includes(theme)) uiState.theme = theme;

    const scale = parseFloat(localStorage.getItem('mp_scale'));
    if (Number.isFinite(scale)) uiState.scale = clampScale(scale);

    const clearGlass = localStorage.getItem('mp_clearGlass');
    if (clearGlass !== null) uiState.clearGlass = clearGlass !== 'false';

    const miniMode = localStorage.getItem('mp_miniMode');
    if (miniMode !== null) uiState.miniMode = miniMode === 'true';
  } catch {}
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

  // Scale the record down proportionally when the widget is small so it never
  // exceeds the widget height. Capped at zoom=1 so it never grows beyond
  // its base 272px (prevents overlap with left-pane controls at large scales).
  const recordEl = document.getElementById('record');
  let recordHalfW = 136; // fallback
  if (recordEl) {
    const maxRecordH = baseH - 16; // 8px breathing room top + bottom
    const recordZoom = Math.max(0.5, Math.min(1, maxRecordH / 272));
    recordEl.style.zoom = String(recordZoom);
    // Compute half-width from zoom directly — do NOT read offsetWidth here.
    // When the deck is display:none (mini/mini-lid modes), offsetWidth = 0
    // and would corrupt --record-right-* vars, causing a 1-second slide
    // animation from the wrong position when the record first becomes visible.
    recordHalfW = Math.round(136 * recordZoom);
  }
  // Record position as fixed pixel distances from the widget's right edge.
  // The widget is right-anchored (right: 18px), so its right edge never moves
  // during width transitions — right:Xpx on the record stays screen-stable.
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
  spectrumCanvas.updateGlassSpectrumGeometry(true);
  if (widgetEl) {
    widgetEl.dataset.transitioning = 'true';
    // Close → lid: 1650ms covers recordClose (880ms) + right transition (1000ms)
    //   + glint sweep (900ms delay + 600ms duration = 1500ms) with 150ms buffer.
    // Open → full: 600ms covers recordOpen (500ms) + right transition (500ms)
    const transTimeout = compactMode ? 1650 : 600;
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
  resizeStartX = ev.clientX;
  resizeStartY = ev.clientY;
  // Use the logical full-view equivalent width, not the current visual width.
  // Without this, mini/lid views start at rect.width (e.g. 300px) which is
  // below MIN_SCALE, causing the widget to jump or feel unresponsive.
  resizeStartWidth = Math.round(uiState.baseWidth * uiState.scale);
  resizing = true;
  setWidgetInteractive(true);
  ev.preventDefault();
  ev.stopPropagation();
}

function onResizeHandleMouseMove(ev) {
  if (!resizing || !widgetEl) return;
  const dx = ev.clientX - resizeStartX;
  const dy = ev.clientY - resizeStartY;
  // Project drag onto the widget's natural 2:1 diagonal.
  // Pure horizontal: full response. Pure vertical: half response.
  // Dragging exactly along the widget diagonal (2px right, 1px down) = full response.
  const combined = dx + dy * 0.5;
  const desiredW = resizeStartWidth + combined;
  const ratio = clampScale(desiredW / uiState.baseWidth);
  if (Math.abs(ratio - uiState.scale) < 0.001) return;
  uiState.scale = ratio;
  if (scaleSliderEl) scaleSliderEl.value = String(Math.round(ratio * 100));
  applyWidgetSize();
  spectrumCanvas.updateGlassSpectrumGeometry(true);
}

function onResizeHandleMouseUp() {
  if (!resizing) return;
  resizing = false;
  setWidgetInteractive(isMouseOverWidget(lastMouseX, lastMouseY));
  saveSettings();
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
  saveSettings();
}

function onScaleChanged(ev) {
  const raw = Number(ev && ev.target ? ev.target.value : 100);
  uiState.scale = clampScale((Number.isFinite(raw) ? raw : 100) / 100);
  applyWidgetSize();
  spectrumCanvas.updateGlassSpectrumGeometry(true);
  saveSettings();
}

function onClearGlassChanged(ev) {
  const on = !!(ev && ev.target && ev.target.checked);
  applyGlassClarity(on);
  saveSettings();
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
  saveSettings();
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

loadSettings();
applyTheme(uiState.theme);
applyGlassClarity(uiState.clearGlass);
setCurrentView(uiState.miniMode ? 'mini' : 'full');
applyWidgetSize();
labelTheme.init(rootStyle);
artTransition.init(
  { recordArtEl, recordArtNewEl, sleeveArtEl, sleeveArtNewEl, miniArtEl },
  () => playbackProgressState.trackKey
);
spectrumCanvas.init(
  { glassSpectrumEl, miniSpectrumEl, miniArtEl, recordEl },
  () => currentView
);
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
transport.init({
  ipcRenderer,
  elements: { btnPrevEl, btnPlayPauseEl, btnNextEl, btnPrevGlassEl, btnPlayPauseGlassEl, btnNextGlassEl, btnPrevMiniEl, btnPlayPauseMiniEl, btnNextMiniEl, btnMiniCollapseEl },
  onMiniCollapseViewChange() {
    suppressNextWidgetToggle = true;
    setCurrentView('lid');
    applyWidgetSize();
    spectrumCanvas.updateGlassSpectrumGeometry(true);
  }
});
volumeControl.init({
  ipcRenderer,
  rootStyle,
  elements: { sourceKnobEl, sourceVolumeGlassEl, volumeBtnGlassEl, volumeValueGlassEl },
  onInteraction: setWidgetInteractive,
  onRelease: () => setWidgetInteractive(isMouseOverWidget(lastMouseX, lastMouseY))
});
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
  themeSelectEl.querySelectorAll('.themePill').forEach(pill => {
    pill.classList.toggle('active', pill.dataset.value === uiState.theme);
    pill.addEventListener('click', () => onThemeChanged({ target: { value: pill.dataset.value } }));
  });
}
if (scaleSliderEl) {
  scaleSliderEl.value = String(Math.round(uiState.scale * 100));
  scaleSliderEl.addEventListener('input', onScaleChanged);
}
if (clearGlassToggleEl) {
  clearGlassToggleEl.checked = uiState.clearGlass;
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
volumeControl.loadSystemVolume();
window.addEventListener('mousemove', onWidgetMouseMove);
window.addEventListener('mousemove', onResizeHandleMouseMove);
window.addEventListener('mouseup', onWidgetMouseUp);
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
  if (albumTextEl) albumTextEl.textContent = meta.album ? `${meta.album}` : 'Album unknown';
  else if (albumEl) albumEl.textContent = meta.album ? `${meta.album}` : 'Album unknown';
  if (titleEl) titleEl.textContent = meta.title || 'Unknown Track';
  if (glassTitleEl) glassTitleEl.textContent = meta.title || 'Unknown Track';
  if (glassArtistEl) glassArtistEl.textContent = meta.artist || 'Unknown Artist';
  if (glassAlbumEl) glassAlbumEl.textContent = meta.album || 'Album unknown';
  if (miniTitleEl) miniTitleEl.textContent = meta.title || 'Unknown Track';
  if (miniArtistEl) miniArtistEl.textContent = meta.artist || 'Unknown Artist';
  volumeControl.updateVolumeUiSource(inferSource(currentMeta.appId));
  transport.updateTransportUi(currentMeta);
  if (labelTitleEl) labelTitleEl.textContent = labelTheme.fitLabelText(meta.title || 'Unknown Track', 16);
  if (labelArtistEl) labelArtistEl.textContent = labelTheme.fitLabelText(meta.artist || 'Unknown Artist', 16);
  labelTheme.applyRecordLabelTheme(meta);

  // Compute track key before touching art so we know whether to animate the swap
  const trackKey = `${currentMeta.appId}|${currentMeta.title}|${currentMeta.artist}`;
  const isNewTrack = !!(prevTrackKey && prevTrackKey !== trackKey);

  artTransition.handleMetaUpdate(meta, trackKey, isNewTrack);

  playbackProgressState.trackKey = trackKey;
  playbackProgressState.playing = currentMeta.playbackStatus === 'playing';
  playbackProgressState.lastTickMs = performance.now();

  // If metadata does not provide timeline data, use a soft default duration.
  const fallbackDuration = 3 * 60 * 1000;
  const duration = currentMeta.durationMs > 0 ? currentMeta.durationMs : fallbackDuration;
  const position = clamp(currentMeta.positionMs || 0, 0, duration);
  playbackProgressState.durationMs = duration;
  playbackProgressState.positionMs = position;

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
      spectrumCanvas.updateGlassSpectrumGeometry(true);
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
      spectrumCanvas.renderGlassSpectrum(freq, active, level);
      spectrumCanvas.renderMiniSpectrum(freq, active);
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
