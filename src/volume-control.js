'use strict';

// ---------------------------------------------------------------------------
// Volume control — source knob (drag), glass slider, mute button.
// Manages its own state and binds the knob/slider DOM events.
// The module handles window-level mousemove/mouseup for knob dragging.
// ---------------------------------------------------------------------------

function clamp(v, min, max) { return Math.min(max, Math.max(min, v)); }

function volumeToAngle(volume) {
  return -24 + clamp(volume, 0, 1) * 52;
}

// Injected at init
let _ipcRenderer    = null;
let _rootStyle      = null;
let _onInteraction  = null; // (interactive: bool) => void  — forwards to setWidgetInteractive
let _onRelease      = null; // () => void — restores widget interactive state after drag/commit ends

const _els = {
  sourceKnobEl: null,
  sourceVolumeGlassEl: null,
  volumeBtnGlassEl: null,
  volumeValueGlassEl: null
};

const _state = {
  volume: 0.5,
  dragging: false,
  startY: 0,
  startVolume: 0,
  commitTimer: null,
  sourceLabel: 'Unknown Source',
  muted: false,
  lastAudibleVolume: 0.5
};

function _queueCommit(volume) {
  if (_state.commitTimer) clearTimeout(_state.commitTimer);
  _state.commitTimer = setTimeout(() => {
    _ipcRenderer.invoke('system-volume:set', volume).catch(() => {});
  }, 90);
}

function setVolumeUi(volume) {
  const v = clamp(volume, 0, 1);
  _state.volume = v;
  _state.muted  = v <= 0.001;
  if (!_state.muted) _state.lastAudibleVolume = v;

  const pct = Math.round(v * 100);
  _rootStyle.setProperty('--source-knob-angle', `${volumeToAngle(v).toFixed(2)}deg`);
  _rootStyle.setProperty('--source-volume-pct', `${pct}%`);

  if (_els.sourceKnobEl) {
    _els.sourceKnobEl.title = `Audio source: ${_state.sourceLabel} | Volume ${pct}%`;
  }
  if (_els.sourceVolumeGlassEl) {
    _els.sourceVolumeGlassEl.value = String(pct);
    _els.sourceVolumeGlassEl.title = `Audio source: ${_state.sourceLabel} | Volume ${pct}%`;
  }
  if (_els.volumeBtnGlassEl) {
    _els.volumeBtnGlassEl.dataset.muted = _state.muted ? 'true' : 'false';
    _els.volumeBtnGlassEl.title = _state.muted ? 'Unmute' : 'Mute';
  }
  if (_els.volumeValueGlassEl) {
    _els.volumeValueGlassEl.textContent = `${pct}%`;
  }
}

async function loadSystemVolume() {
  try {
    const level = await _ipcRenderer.invoke('system-volume:get');
    if (Number.isFinite(level)) setVolumeUi(level);
  } catch {}
}

// { id, label, accent } — sourced from app.js SOURCE_PRESETS
function updateVolumeUiSource(source) {
  _rootStyle.setProperty('--source-accent', source.accent);
  _state.sourceLabel = source.label;
  setVolumeUi(_state.volume);
}

// ── Event handlers ──────────────────────────────────────────────────────────

function _onKnobMouseDown(ev) {
  if (!_els.sourceKnobEl || ev.button !== 0) return;
  _state.dragging     = true;
  _state.startY       = ev.clientY;
  _state.startVolume  = _state.volume;
  if (_onInteraction) _onInteraction(true);
  ev.preventDefault();
  ev.stopPropagation();
}

function _onKnobWheel(ev) {
  if (!_els.sourceKnobEl) return;
  const delta = ev.deltaY > 0 ? -0.06 : 0.06;
  const next  = clamp(_state.volume + delta, 0, 1);
  setVolumeUi(next);
  _queueCommit(next);
  ev.preventDefault();
  ev.stopPropagation();
}

function _onKnobMouseMove(ev) {
  if (!_state.dragging) return;
  const delta = (_state.startY - ev.clientY) / 120;
  const next  = clamp(_state.startVolume + delta, 0, 1);
  setVolumeUi(next);
  _queueCommit(next);
}

function _onKnobMouseUp() {
  if (!_state.dragging) return;
  _state.dragging = false;
  if (_state.commitTimer) { clearTimeout(_state.commitTimer); _state.commitTimer = null; }
  _ipcRenderer.invoke('system-volume:set', _state.volume).catch(() => {});
  if (_onRelease) _onRelease();
}

function _onSliderInput(ev) {
  if (!_els.sourceVolumeGlassEl) return;
  const raw  = Number(ev.target && ev.target.value);
  const next = clamp(Number.isFinite(raw) ? raw / 100 : _state.volume, 0, 1);
  setVolumeUi(next);
  _ipcRenderer.invoke('system-volume:set', next).catch(() => {});
  if (_onInteraction) _onInteraction(true);
  ev.preventDefault();
  ev.stopPropagation();
}

function _onSliderWheel(ev) {
  if (!_els.sourceVolumeGlassEl) return;
  const delta = ev.deltaY > 0 ? -0.06 : 0.06;
  const next  = clamp(_state.volume + delta, 0, 1);
  setVolumeUi(next);
  _queueCommit(next);
  ev.preventDefault();
  ev.stopPropagation();
}

function _onSliderCommit(ev) {
  if (_state.commitTimer) { clearTimeout(_state.commitTimer); _state.commitTimer = null; }
  const raw  = Number(ev && ev.target && ev.target.value);
  const next = clamp(Number.isFinite(raw) ? raw / 100 : _state.volume, 0, 1);
  setVolumeUi(next);
  _ipcRenderer.invoke('system-volume:set', next).catch(() => {});
  if (_onRelease) _onRelease();
}

function _onMuteClick(ev) {
  if (!_els.volumeBtnGlassEl) return;
  ev.preventDefault();
  ev.stopPropagation();

  const next = _state.muted
    ? clamp(_state.lastAudibleVolume > 0.01 ? _state.lastAudibleVolume : 0.5, 0, 1)
    : 0;

  if (!_state.muted && _state.volume > 0.01) {
    _state.lastAudibleVolume = _state.volume;
  }

  setVolumeUi(next);
  if (_state.commitTimer) { clearTimeout(_state.commitTimer); _state.commitTimer = null; }
  _ipcRenderer.invoke('system-volume:set', next).catch(() => {});
  _els.volumeBtnGlassEl.blur();
}

// Exposed so app.js window-level mouseup handler can release drag state.
function isKnobDragging() { return _state.dragging; }

function releaseKnobDrag() {
  _onKnobMouseUp();
}

// ── Init ────────────────────────────────────────────────────────────────────

// elements: { sourceKnobEl, sourceVolumeGlassEl, volumeBtnGlassEl, volumeValueGlassEl }
// onInteraction: (bool) => void — setWidgetInteractive from app.js
// onRelease: () => void — called after knob drag or slider commit ends
function init({ ipcRenderer, rootStyle, elements, onInteraction, onRelease }) {
  _ipcRenderer   = ipcRenderer;
  _rootStyle     = rootStyle;
  _onInteraction = onInteraction || null;
  _onRelease     = onRelease     || null;

  _els.sourceKnobEl       = elements.sourceKnobEl       || null;
  _els.sourceVolumeGlassEl = elements.sourceVolumeGlassEl || null;
  _els.volumeBtnGlassEl   = elements.volumeBtnGlassEl   || null;
  _els.volumeValueGlassEl = elements.volumeValueGlassEl || null;

  if (_els.sourceKnobEl) {
    _els.sourceKnobEl.addEventListener('mousedown', _onKnobMouseDown);
    _els.sourceKnobEl.addEventListener('wheel', _onKnobWheel, { passive: false });
  }
  if (_els.sourceVolumeGlassEl) {
    _els.sourceVolumeGlassEl.addEventListener('input',  _onSliderInput);
    _els.sourceVolumeGlassEl.addEventListener('change', _onSliderCommit);
    _els.sourceVolumeGlassEl.addEventListener('wheel',  _onSliderWheel, { passive: false });
  }
  if (_els.volumeBtnGlassEl) {
    _els.volumeBtnGlassEl.addEventListener('click', _onMuteClick);
  }

  // Knob drag needs window-level tracking
  window.addEventListener('mousemove', _onKnobMouseMove);
  window.addEventListener('mouseup',   _onKnobMouseUp);
}

module.exports = { init, setVolumeUi, loadSystemVolume, updateVolumeUiSource, isKnobDragging, releaseKnobDrag };
