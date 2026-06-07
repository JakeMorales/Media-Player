'use strict';

// ui.js - DOM refs, layout, interaction, settings, power light

const { ipcRenderer } = require('electron');
const cfg             = require('./config');
const spectrumCanvas  = require('./spectrum-canvas');
const { openMetadataUrl } = require('./player');

// --- DOM refs (auto-generated from ID list) ---

const el = {};
const EL_IDS = [
  'status','widget','frame','artist','album','albumText','title',
  'miniTitle','miniArtist','miniArt','miniArtWrap','miniSpectrum',
  'miniProgressFill','miniPane',
  'glassTitle','glassArtist','glassAlbum',
  'sourceKnob','sourceVolumeGlass','volumeValueGlass','volumeBtnGlass',
  'btnPrev','btnPlayPause','btnNext',
  'btnPrevGlass','btnPlayPauseGlass','btnNextGlass',
  'btnPrevMini','btnPlayPauseMini','btnNextMini',
  'btnMiniCollapse','btnSettings','settingsPanel',
  'themeSelect','recordSelect','recordLidSelect',
  'scaleSlider','clearGlassToggle','launchToggle','miniModeToggle',
  'btnCloseApp','glassMenuBtn','glassQuickMenu','quickMini','quickSettings',
  'resizeHandle','pinBtn','rightPane','record',
  'sleeveArt','sleeveArtNew','recordArt','recordArtNew',
  'glassSpectrum','labelTitle','labelArtist','powerLight','armMount'
];
EL_IDS.forEach(id => { el[id + 'El'] = document.getElementById(id); });
const rootStyle = document.documentElement.style;

// --- Constants ---

const PIN_CORNER_PX = 64, RESIZE_CORNER_PX = 48, DRAG_THRESHOLD = 6;
const MIN_SCALE = 0.7, MAX_SCALE = 1.35;

// --- UI state ---

let dragging = false, pointerDown = false, compactMode = false;
let currentView = 'full', isTransitioning = false, isPinned = false;
let pinHoverTimer = null, pendingToggleClick = false;
let pointerDownX = 0, pointerDownY = 0;
let isHoveringWidget = false, lastMouseX = 0, lastMouseY = 0;
let settingsOpen = false, quickMenuOpen = false;
let resizing = false, resizeStartX = 0, resizeStartY = 0, resizeStartWidth = 0;
let suppressNextWidgetToggle = false;
const dragState = { offsetX: 0, offsetY: 0 };

const uiState = {
  scale: 1, baseWidth: cfg.widget.width, miniMode: false,
  theme: 'light', clearGlass: true, recordStyle: 'album', recordStyleLid: 'album'
};

let _powerLightTimer = null, _powerLightOn = false, _powerLightFollowRaf = null;

// --- Utilities ---

function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }
function clampScale(v) { return clamp(v, MIN_SCALE, MAX_SCALE); }
function isLidLikeView(view = currentView) { return view === 'lid' || view === 'mini-lid'; }

function isTextTarget(target) {
  if (!(target instanceof Element)) return false;
  return !!target.closest(
    '#title, #artist, #album, #glassTitle, #glassArtist, #glassAlbum,' +
    '#sourceKnob, #sourceVolumeGlass, #volumeBtnGlass, #volumePopup,' +
    '#btnPrev, #btnPlayPause, #btnNext,' +
    '#btnPrevGlass, #btnPlayPauseGlass, #btnNextGlass,' +
    '#btnPrevMini, #btnPlayPauseMini, #btnNextMini,' +
    '#btnMiniCollapse, #miniContent, #miniProgress,' +
    '#btnSettings, #settingsPanel, #glassMenuBtn, #glassQuickMenu,' +
    '#quickMini, #quickSettings, #resizeHandle,' +
    '#labelTitle, #labelArtist, #labelTopText, #labelCatalog, #labelSideText, #pinBtn'
  );
}

// --- Theme & visual state ---

function applyTheme(theme) {
  uiState.theme = theme;
  if (el.widgetEl) el.widgetEl.dataset.theme = theme;
  if (el.themeSelectEl) {
    el.themeSelectEl.querySelectorAll('.themePill').forEach(pill => {
      pill.classList.toggle('active', pill.dataset.value === theme);
    });
  }
  applyRecordStyles();
}

function applyRecordStyles() {
  if (!el.widgetEl) return;
  el.widgetEl.dataset.recordStyle = uiState.recordStyle || 'album';
  el.widgetEl.dataset.recordStyleLid = uiState.recordStyleLid || 'album';
  if (el.recordArtEl) {
    const active = isLidLikeView() ? uiState.recordStyleLid : uiState.recordStyle;
    const show = (active || 'album') === 'album';
    el.recordArtEl.style.opacity = show ? '1' : '0';
    el.recordArtNewEl.style.opacity = show ? '1' : '0';
  }
}

function applyGlassClarity(enabled) {
  uiState.clearGlass = !!enabled;
  rootStyle.setProperty('--glass-clarity', enabled ? '0.28' : '0.72');
}

// --- Widget size & layout ---

function applyWidgetSize() {
  if (!el.widgetEl) return;
  const rect = el.widgetEl.getBoundingClientRect();
  if (el.widgetEl.style.left && el.widgetEl.style.left !== 'auto') {
    el.widgetEl.style.left = 'auto';
    el.widgetEl.style.right = `${Math.max(0, window.innerWidth - rect.right)}px`;
  }

  const maxW = Math.max(280, window.innerWidth - 24);
  const scaledBaseW = Math.round(uiState.baseWidth * uiState.scale);
  const baseW = Math.min(scaledBaseW, maxW);
  const baseH = Math.round(baseW / 2);
  const lidW = Math.round(baseW * 0.5);
  const miniW = lidW;
  const miniLidW = Math.max(110, Math.round(miniW * 0.5));
  const miniLidH = Math.max(72, Math.round(baseH * 0.5));

  let w = baseW, h = baseH;
  if (currentView === 'lid')           { w = lidW; }
  else if (currentView === 'mini')     { w = miniW; h = Math.max(84, Math.round(baseH * 0.34)); }
  else if (currentView === 'mini-lid') { w = miniLidW; h = miniLidH; }

  el.widgetEl.style.width = `${w}px`;
  el.widgetEl.style.height = `${h}px`;

  let recordHalfW = 136;
  if (el.recordEl) {
    const recordZoom = Math.max(0.5, Math.min(1, (baseH - 16) / 272));
    el.recordEl.style.zoom = String(recordZoom);
    recordHalfW = Math.round(136 * recordZoom);
  }
  document.documentElement.style.setProperty('--record-right-full', `${Math.round(baseW / 2) - recordHalfW}px`);
  document.documentElement.style.setProperty('--record-right-lid', `${Math.round(lidW * 0.49) - recordHalfW}px`);
  updatePowerLightPosition();
}

// --- View & panel state ---

function setCurrentView(view) {
  currentView = view;
  compactMode = isLidLikeView(view);
  if (el.widgetEl) el.widgetEl.dataset.view = view;
  if (el.miniModeToggleEl) el.miniModeToggleEl.checked = view === 'mini' || view === 'mini-lid';
  applyRecordStyles();
}

function setSettingsOpen(open) {
  settingsOpen = !!open;
  if (el.settingsPanelEl) {
    el.settingsPanelEl.dataset.open = settingsOpen ? 'true' : 'false';
    el.settingsPanelEl.setAttribute('aria-hidden', settingsOpen ? 'false' : 'true');
  }
}

function setQuickMenuOpen(open) {
  quickMenuOpen = !!open;
  if (el.glassQuickMenuEl) {
    el.glassQuickMenuEl.dataset.open = quickMenuOpen ? 'true' : 'false';
    el.glassQuickMenuEl.setAttribute('aria-hidden', quickMenuOpen ? 'false' : 'true');
  }
}

function toggleCompactMode() {
  if (isTransitioning) return;
  isTransitioning = true;
  if (currentView === 'mini') setCurrentView('mini-lid');
  else if (currentView === 'mini-lid') setCurrentView('mini');
  else setCurrentView(compactMode ? 'full' : 'lid');

  applyWidgetSize();
  spectrumCanvas.updateGlassSpectrumGeometry(true);

  if (el.widgetEl) {
    el.widgetEl.dataset.transitioning = 'true';
    const transTimeout = compactMode ? 1650 : 600;
    setTimeout(() => {
      if (el.widgetEl) el.widgetEl.dataset.transitioning = 'false';
      isTransitioning = false;
      if (el.powerLightEl) {
        el.powerLightEl.style.zIndex = '';
        if (el.powerLightEl.dataset._prevZ) delete el.powerLightEl.dataset._prevZ;
      }
    }, transTimeout);
    startPowerLightFollowLoop(transTimeout + 200);
  } else {
    isTransitioning = false;
  }
}

// --- Album marquee ---

function updateAlbumMarqueeState() {
  if (!el.albumEl || !el.albumTextEl) return;
  const overflow = el.albumTextEl.scrollWidth - el.albumEl.clientWidth;
  if (overflow > 4) {
    el.albumEl.classList.add('can-scroll');
    el.albumEl.style.setProperty('--album-scroll-target', `-${Math.ceil(overflow)}px`);
    el.albumEl.style.setProperty('--album-scroll-duration', `${Math.min(9, Math.max(3, overflow / 34)).toFixed(2)}s`);
  } else {
    el.albumEl.classList.remove('can-scroll');
    el.albumEl.style.setProperty('--album-scroll-target', '0px');
  }
}

// --- Status & power light ---

function setStatus(active, level) {
  if (!el.statusEl) return;
  const pct = Math.round(level * 100);
  el.statusEl.textContent = active ? `AUDIO ACTIVE ${pct}%` : `LISTENING ${pct}%`;
  el.statusEl.dataset.state = active ? 'active' : 'idle';
  if (el.widgetEl) el.widgetEl.dataset.state = active ? 'active' : 'idle';
  updatePowerLight(active);
}

function setPowerLight(on) {
  if (!el.powerLightEl) return;
  _powerLightOn = !!on;
  el.powerLightEl.classList.toggle('on', _powerLightOn);
}

function updatePowerLight(active, playbackPlaying) {
  if (playbackPlaying || active) {
    if (_powerLightTimer) { clearTimeout(_powerLightTimer); _powerLightTimer = null; }
    setPowerLight(true);
    return;
  }
  if (_powerLightTimer) clearTimeout(_powerLightTimer);
  _powerLightTimer = setTimeout(() => { setPowerLight(false); _powerLightTimer = null; }, 1100);
}

function updatePowerLightPosition() {
  if (!el.powerLightEl || !el.armMountEl || !el.widgetEl) return;
  const mountRect = el.armMountEl.getBoundingClientRect();
  const widgetRect = el.widgetEl.getBoundingClientRect();
  const lightW = Math.max(12, el.powerLightEl.offsetWidth || 14);
  const lightH = Math.max(12, el.powerLightEl.offsetHeight || 14);

  const baseOffset = (currentView === 'full' || currentView === 'mini') ? 22 : 12;
  const transNudge = (el.widgetEl.dataset.transitioning === 'true') ? 10 : 0;
  const xRaw = Math.round(mountRect.right - widgetRect.left + baseOffset) + transNudge;
  const x = Math.min(Math.max(8, xRaw), Math.max(8, Math.round(widgetRect.width - lightW - 8)));
  const y = Math.round((mountRect.top + mountRect.height / 2) - widgetRect.top - (lightH / 2));

  el.powerLightEl.style.left = `${x}px`;
  el.powerLightEl.style.top = `${y}px`;

  try {
    const sleeveEl = document.getElementById('sleeve');
    if (sleeveEl) {
      const topEl = document.elementFromPoint(
        Math.round(widgetRect.left + x + lightW / 2),
        Math.round(widgetRect.top + y + lightH / 2)
      );
      const shouldHide = topEl && topEl.closest && !!topEl.closest('#sleeve') && el.widgetEl.dataset.transitioning === 'true';
      el.powerLightEl.classList.toggle('under-sleeve', shouldHide);
    }
  } catch (_) {}
}

function startPowerLightFollowLoop(timeoutMs = 2000) {
  if (_powerLightFollowRaf) return;
  if (el.powerLightEl) {
    el.powerLightEl.dataset._prevZ = el.powerLightEl.style.zIndex || '';
    el.powerLightEl.style.zIndex = '5';
  }
  const start = performance.now();
  function tick(now) {
    updatePowerLightPosition();
    if ((!isTransitioning && !(el.widgetEl && el.widgetEl.dataset.transitioning === 'true')) || now - start >= timeoutMs) {
      if (el.powerLightEl) {
        el.powerLightEl.style.zIndex = el.powerLightEl.dataset._prevZ || '';
        delete el.powerLightEl.dataset._prevZ;
      }
      _powerLightFollowRaf = null;
      return;
    }
    _powerLightFollowRaf = requestAnimationFrame(tick);
  }
  _powerLightFollowRaf = requestAnimationFrame(tick);
}

// --- Widget interactivity ---

function setWidgetInteractive(interactive) { ipcRenderer.send('overlay:hover-widget', !!interactive); }

function isMouseOverWidget(x, y) {
  if (!el.widgetEl) return false;
  const r = el.widgetEl.getBoundingClientRect();
  return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
}

function clampWidgetPosition(x, y) {
  if (!el.widgetEl) return { x, y };
  const r = el.widgetEl.getBoundingClientRect();
  return {
    x: Math.min(Math.max(0, x), Math.max(0, window.innerWidth - r.width)),
    y: Math.min(Math.max(0, y), Math.max(0, window.innerHeight - r.height))
  };
}

// --- Drag ---

function onWidgetMouseDown(ev) {
  if (!el.widgetEl || ev.button !== 0) return;
  if (ev.target instanceof Element && ev.target.closest(
    '#sourceKnob, #sourceVolumeGlass, #volumeBtnGlass, #volumePopup,' +
    '#miniControls button, #miniArtWrap, #miniArt, #miniSpectrum'
  )) return;

  const rect = el.widgetEl.getBoundingClientRect();
  pointerDown = true; pointerDownX = ev.clientX; pointerDownY = ev.clientY;

  if (currentView === 'mini-lid' && ev.target instanceof Element) {
    pendingToggleClick = !ev.target.closest('#miniControls button, #glassMenuBtn, #glassQuickMenu, #quickMini, #quickSettings, #pinBtn');
  } else {
    pendingToggleClick = !isTextTarget(ev.target);
  }
  dragState.offsetX = ev.clientX - rect.left;
  dragState.offsetY = ev.clientY - rect.top;
  dragging = false;
  el.widgetEl.dataset.dragging = 'false';
  setWidgetInteractive(true);
  ev.preventDefault();
}

function onWidgetMouseMove(ev) {
  lastMouseX = ev.clientX; lastMouseY = ev.clientY;
  const hovering = isMouseOverWidget(lastMouseX, lastMouseY);

  if (hovering !== isHoveringWidget && !dragging) {
    isHoveringWidget = hovering;
    setWidgetInteractive(isHoveringWidget);
  }

  if (el.widgetEl && !pointerDown) {
    const rect = el.widgetEl.getBoundingClientRect();
    const inCorner = hovering && ev.clientX >= rect.right - PIN_CORNER_PX && ev.clientY <= rect.top + PIN_CORNER_PX;
    if (inCorner && !isPinned) {
      if (!pinHoverTimer) {
        pinHoverTimer = setTimeout(() => { if (el.widgetEl) el.widgetEl.dataset.pinHint = 'true'; pinHoverTimer = null; }, 1800);
      }
    } else {
      if (pinHoverTimer) { clearTimeout(pinHoverTimer); pinHoverTimer = null; }
      if (el.widgetEl.dataset.pinHint === 'true' && !isPinned) el.widgetEl.dataset.pinHint = 'false';
    }
    const inResize = hovering && ev.clientX >= rect.right - RESIZE_CORNER_PX && ev.clientY >= rect.bottom - RESIZE_CORNER_PX;
    if (el.widgetEl.dataset.resizeHint !== String(inResize)) el.widgetEl.dataset.resizeHint = String(inResize);
  }

  if (!pointerDown || !el.widgetEl) return;
  const moved = Math.hypot(ev.clientX - pointerDownX, ev.clientY - pointerDownY);

  if (!dragging && moved >= DRAG_THRESHOLD) {
    if (isPinned) return;
    const rect = el.widgetEl.getBoundingClientRect();
    el.widgetEl.style.left = `${rect.left}px`;
    el.widgetEl.style.top = `${rect.top}px`;
    el.widgetEl.style.right = 'auto';
    dragging = true; pendingToggleClick = false;
    el.widgetEl.dataset.dragging = 'true';
  }
  if (!dragging) return;
  const pos = clampWidgetPosition(ev.clientX - dragState.offsetX, ev.clientY - dragState.offsetY);
  el.widgetEl.style.left = `${pos.x}px`;
  el.widgetEl.style.top = `${pos.y}px`;
}

function onWidgetMouseUp(ev) {
  if (!el.widgetEl) return;
  const wasDown = pointerDown;
  pointerDown = false;
  if (dragging) dragging = false;
  el.widgetEl.dataset.dragging = 'false';

  const upX = ev ? ev.clientX : lastMouseX;
  const upY = ev ? ev.clientY : lastMouseY;
  lastMouseX = upX; lastMouseY = upY;
  const moved = Math.hypot(upX - pointerDownX, upY - pointerDownY);

  if (suppressNextWidgetToggle) {
    suppressNextWidgetToggle = false; pendingToggleClick = false;
    isHoveringWidget = isMouseOverWidget(upX, upY);
    setWidgetInteractive(isHoveringWidget);
    return;
  }
  if (wasDown && pendingToggleClick && moved < DRAG_THRESHOLD) {
    if (currentView === 'mini-lid') { setCurrentView('mini'); applyWidgetSize(); }
    else toggleCompactMode();
  }
  pendingToggleClick = false;
  isHoveringWidget = isMouseOverWidget(upX, upY);
  setWidgetInteractive(isHoveringWidget);
}

// --- Resize ---

function onResizeHandleMouseDown(ev) {
  if (ev.button !== 0 || !el.widgetEl) return;
  resizeStartX = ev.clientX; resizeStartY = ev.clientY;
  resizeStartWidth = Math.round(uiState.baseWidth * uiState.scale);
  resizing = true;
  setWidgetInteractive(true);
  ev.preventDefault(); ev.stopPropagation();
}

function onResizeHandleMouseMove(ev) {
  if (!resizing || !el.widgetEl) return;
  const combined = (ev.clientX - resizeStartX) + (ev.clientY - resizeStartY) * 0.5;
  const ratio = clampScale((resizeStartWidth + combined) / uiState.baseWidth);
  if (Math.abs(ratio - uiState.scale) < 0.001) return;
  uiState.scale = ratio;
  if (el.scaleSliderEl) el.scaleSliderEl.value = String(Math.round(ratio * 100));
  applyWidgetSize();
  spectrumCanvas.updateGlassSpectrumGeometry(true);
}

function onResizeHandleMouseUp() {
  if (!resizing) return;
  resizing = false;
  setWidgetInteractive(isMouseOverWidget(lastMouseX, lastMouseY));
  saveSettings();
}

// --- Settings & quick-menu handlers ---

function stopEvent(ev) { ev.preventDefault(); ev.stopPropagation(); }

function onSettingsButtonClick(ev) { stopEvent(ev); setSettingsOpen(!settingsOpen); setQuickMenuOpen(false); }
function onGlassMenuClick(ev) { stopEvent(ev); setQuickMenuOpen(!quickMenuOpen); }

function onPinButtonClick(ev) {
  stopEvent(ev);
  isPinned = !isPinned;
  if (el.widgetEl) {
    el.widgetEl.dataset.pinned = String(isPinned);
    if (isPinned) {
      const rect = el.widgetEl.getBoundingClientRect();
      el.widgetEl.style.left = `${rect.left}px`;
      el.widgetEl.style.top = `${rect.top}px`;
      el.widgetEl.style.right = 'auto';
      el.widgetEl.dataset.pinHint = 'false';
    }
  }
  if (el.pinBtnEl) el.pinBtnEl.setAttribute('aria-pressed', String(isPinned));
}

function onQuickMiniClick(ev) {
  stopEvent(ev);
  setCurrentView((currentView === 'mini' || currentView === 'mini-lid') ? 'full' : 'mini');
  applyWidgetSize(); setQuickMenuOpen(false);
}
function onQuickSettingsClick(ev) { stopEvent(ev); setQuickMenuOpen(false); setSettingsOpen(true); }

function onThemeChanged(ev) { applyTheme(ev && ev.target ? ev.target.value : 'light'); saveSettings(); }

function onScaleChanged(ev) {
  const raw = Number(ev && ev.target ? ev.target.value : 100);
  uiState.scale = clampScale((Number.isFinite(raw) ? raw : 100) / 100);
  applyWidgetSize(); spectrumCanvas.updateGlassSpectrumGeometry(true); saveSettings();
}

function onClearGlassChanged(ev) { applyGlassClarity(!!(ev && ev.target && ev.target.checked)); saveSettings(); }

function onMiniModeToggle(ev) {
  setCurrentView(!!(ev && ev.target && ev.target.checked) ? 'mini' : 'full');
  applyWidgetSize(); saveSettings();
}

// --- Settings persistence ---

function saveSettings() {
  try {
    const isMini = currentView === 'mini' || currentView === 'mini-lid';
    localStorage.setItem('mp_theme', uiState.theme);
    localStorage.setItem('mp_scale', String(uiState.scale));
    localStorage.setItem('mp_clearGlass', String(uiState.clearGlass));
    localStorage.setItem('mp_miniMode', String(isMini));
    localStorage.setItem('mp_record_expanded', uiState.recordStyle || 'album');
    localStorage.setItem('mp_record_lid', uiState.recordStyleLid || 'album');
  } catch {}
}

function loadSettings() {
  try {
    const theme = localStorage.getItem('mp_theme');
    if (theme && ['light','dark','cream','pastel','transparent'].includes(theme)) uiState.theme = theme;
    const scale = parseFloat(localStorage.getItem('mp_scale'));
    if (Number.isFinite(scale)) uiState.scale = clampScale(scale);
    const cg = localStorage.getItem('mp_clearGlass');
    if (cg !== null) uiState.clearGlass = cg !== 'false';
    const mm = localStorage.getItem('mp_miniMode');
    if (mm !== null) uiState.miniMode = mm === 'true';
    const vr = ['album','black','white','transparent'];
    const re = localStorage.getItem('mp_record_expanded');
    if (re && vr.includes(re)) uiState.recordStyle = re;
    const rl = localStorage.getItem('mp_record_lid');
    if (rl && vr.includes(rl)) uiState.recordStyleLid = rl;
  } catch {}
}

async function loadLaunchSetting() {
  if (!el.launchToggleEl) return;
  try { el.launchToggleEl.checked = !!(await ipcRenderer.invoke('settings:launch-on-start:get')); }
  catch { el.launchToggleEl.checked = false; }
}

async function onLaunchToggleChanged(ev) {
  const on = !!(ev && ev.target && ev.target.checked);
  try {
    const ok = await ipcRenderer.invoke('settings:launch-on-start:set', on);
    if (!ok) throw new Error();
    if (el.launchToggleEl) el.launchToggleEl.checked = !!(await ipcRenderer.invoke('settings:launch-on-start:get'));
  } catch {
    try { if (el.launchToggleEl) el.launchToggleEl.checked = !!(await ipcRenderer.invoke('settings:launch-on-start:get')); }
    catch { if (el.launchToggleEl) el.launchToggleEl.checked = !on; }
  }
}

async function onCloseAppClick(ev) {
  if (ev) stopEvent(ev);
  try { await ipcRenderer.invoke('app:close'); } catch { window.close(); }
}

// --- Metadata link binding ---

function bindMetadataLinks() {
  const links = [
    [el.titleEl, 'title'], [el.artistEl, 'artist'], [el.albumEl, 'album'],
    [el.glassTitleEl, 'title'], [el.glassArtistEl, 'artist'], [el.glassAlbumEl, 'album']
  ];
  for (const [elem, kind] of links) {
    if (!elem) continue;
    elem.dataset.link = 'true';
    elem.title = 'Open in source';
    elem.addEventListener('click', (ev) => { ev.preventDefault(); ev.stopPropagation(); openMetadataUrl(kind); });
  }
}

// --- Record pill wiring ---

function wireRecordPills(container, stateKey) {
  if (!container) return;
  container.querySelectorAll('.recordPill').forEach(pill => {
    pill.classList.toggle('active', pill.dataset.value === uiState[stateKey]);
    pill.addEventListener('click', () => {
      uiState[stateKey] = pill.dataset.value;
      applyRecordStyles(); saveSettings();
      container.querySelectorAll('.recordPill').forEach(p => p.classList.toggle('active', p === pill));
    });
  });
}

// --- Init ---

function initUI() {
  loadSettings();
  applyTheme(uiState.theme);
  applyGlassClarity(uiState.clearGlass);
  setCurrentView(uiState.miniMode ? 'mini' : 'full');
  applyWidgetSize();

  wireRecordPills(el.recordSelectEl, 'recordStyle');
  wireRecordPills(el.recordLidSelectEl, 'recordStyleLid');

  if (el.widgetEl) {
    Object.assign(el.widgetEl.dataset, { draggable:'true', dragging:'false', transitioning:'false', pinHint:'false', pinned:'false', resizeHint:'false' });
    el.widgetEl.addEventListener('mousedown', onWidgetMouseDown);
  }

  if (el.btnSettingsEl) el.btnSettingsEl.addEventListener('click', onSettingsButtonClick);
  if (el.glassMenuBtnEl) el.glassMenuBtnEl.addEventListener('click', onGlassMenuClick);
  if (el.pinBtnEl) el.pinBtnEl.addEventListener('click', onPinButtonClick);
  if (el.quickMiniEl) el.quickMiniEl.addEventListener('click', onQuickMiniClick);
  if (el.quickSettingsEl) el.quickSettingsEl.addEventListener('click', onQuickSettingsClick);
  if (el.btnCloseAppEl) el.btnCloseAppEl.addEventListener('click', onCloseAppClick);

  if (el.themeSelectEl) {
    el.themeSelectEl.querySelectorAll('.themePill').forEach(pill => {
      pill.classList.toggle('active', pill.dataset.value === uiState.theme);
      pill.addEventListener('click', () => onThemeChanged({ target: { value: pill.dataset.value } }));
    });
  }
  if (el.scaleSliderEl) { el.scaleSliderEl.value = String(Math.round(uiState.scale * 100)); el.scaleSliderEl.addEventListener('input', onScaleChanged); }
  if (el.clearGlassToggleEl) { el.clearGlassToggleEl.checked = uiState.clearGlass; el.clearGlassToggleEl.addEventListener('change', onClearGlassChanged); }
  if (el.launchToggleEl) el.launchToggleEl.addEventListener('change', onLaunchToggleChanged);
  if (el.miniModeToggleEl) { el.miniModeToggleEl.checked = false; el.miniModeToggleEl.addEventListener('change', onMiniModeToggle); }
  if (el.resizeHandleEl) el.resizeHandleEl.addEventListener('mousedown', onResizeHandleMouseDown);

  if (el.miniPaneEl) {
    el.miniPaneEl.addEventListener('dblclick', (ev) => {
      stopEvent(ev);
      if (currentView === 'mini') setCurrentView('mini-lid');
      else if (currentView === 'mini-lid') setCurrentView('mini');
      applyWidgetSize();
    });
  }
  if (el.miniArtWrapEl) {
    el.miniArtWrapEl.addEventListener('mousedown', (ev) => {
      stopEvent(ev);
      if (currentView !== 'mini') return;
      suppressNextWidgetToggle = true;
      setCurrentView('mini-lid'); applyWidgetSize();
    });
  }
  if (el.miniArtEl) el.miniArtEl.draggable = false;

  bindMetadataLinks();

  window.addEventListener('mousemove', onWidgetMouseMove);
  window.addEventListener('mousemove', onResizeHandleMouseMove);
  window.addEventListener('mouseup', onWidgetMouseUp);
  window.addEventListener('mouseup', onResizeHandleMouseUp);
  window.addEventListener('blur', () => {
    if (resizing) { resizing = false; setWidgetInteractive(false); }
    if (pointerDown) { pointerDown = false; dragging = false; if (el.widgetEl) el.widgetEl.dataset.dragging = 'false'; }
  });
  window.addEventListener('mousedown', (ev) => {
    if (!(ev.target instanceof Element)) return;
    if (settingsOpen && !ev.target.closest('#settingsPanel, #btnSettings, #quickSettings')) setSettingsOpen(false);
    if (quickMenuOpen && !ev.target.closest('#glassQuickMenu, #glassMenuBtn')) setQuickMenuOpen(false);
  });

  setWidgetInteractive(false);
  loadLaunchSetting();
}

// --- Exports ---

module.exports = {
  initUI, el, rootStyle,
  getUiState: () => uiState,
  getCurrentView: () => currentView,
  getLastMouse: () => ({ x: lastMouseX, y: lastMouseY }),
  isHovering: () => isHoveringWidget,
  setSuppressFlag: (v) => { suppressNextWidgetToggle = !!v; },
  applyWidgetSize, setCurrentView, updateAlbumMarqueeState,
  updatePowerLight, setStatus, setWidgetInteractive, isMouseOverWidget,
  saveSettings, clamp
};
