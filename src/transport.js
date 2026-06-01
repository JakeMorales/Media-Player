'use strict';

// ---------------------------------------------------------------------------
// Transport controls — prev / play-pause / next across full, lid, and mini
// views. Binds click handlers and keeps all three play-pause buttons in sync.
// ---------------------------------------------------------------------------

let _ipcRenderer = null;
let _suppressViewToggle = null; // () => void — called by mini-collapse to prevent toggle

const _btns = {
  prev:      null, playPause:      null, next:      null, // full view
  prevGlass: null, playPauseGlass: null, nextGlass: null, // lid view
  prevMini:  null, playPauseMini:  null, nextMini:  null, // mini view
  miniCollapse: null
};

function _triggerAction(action) {
  _ipcRenderer.invoke('media-control', action).catch(() => {});
}

function _clickHandler(action) {
  return (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    _triggerAction(action);
  };
}

function setTransportEnabled(enabled) {
  const all = Object.values(_btns);
  for (const btn of all) {
    if (btn) btn.disabled = !enabled;
  }
}

function _applyPlayPause(btn, playing, canToggle) {
  if (!btn) return;
  btn.disabled = !canToggle;
  btn.dataset.playing = playing ? 'true' : 'false';
  btn.setAttribute('aria-label', playing ? 'Pause' : 'Play');
  btn.title = playing ? 'Pause' : 'Play';
}

function updateTransportUi(meta) {
  const controls = meta.controls || {};
  const canPrev  = controls.canSkipPrevious !== false;
  const canNext  = controls.canSkipNext     !== false;
  const canPlay  = controls.canPlay         !== false;
  const canPause = controls.canPause        !== false;
  const canToggle = canPlay || canPause;
  const playing   = (meta.playbackStatus || '').toLowerCase() === 'playing';

  if (_btns.prev)      _btns.prev.disabled      = !canPrev;
  if (_btns.next)      _btns.next.disabled      = !canNext;
  if (_btns.prevGlass) _btns.prevGlass.disabled = !canPrev;
  if (_btns.nextGlass) _btns.nextGlass.disabled = !canNext;
  if (_btns.prevMini)  _btns.prevMini.disabled  = !canPrev;
  if (_btns.nextMini)  _btns.nextMini.disabled  = !canNext;

  _applyPlayPause(_btns.playPause,      playing, canToggle);
  _applyPlayPause(_btns.playPauseGlass, playing, canToggle);
  _applyPlayPause(_btns.playPauseMini,  playing, canToggle);
}

// elements map — keys match _btns object
// suppressViewToggle: () => void — called by mini-collapse to set suppressNextWidgetToggle
function init({ ipcRenderer, elements, onMiniCollapseViewChange }) {
  _ipcRenderer = ipcRenderer;

  _btns.prev         = elements.btnPrevEl         || null;
  _btns.playPause    = elements.btnPlayPauseEl     || null;
  _btns.next         = elements.btnNextEl          || null;
  _btns.prevGlass    = elements.btnPrevGlassEl     || null;
  _btns.playPauseGlass = elements.btnPlayPauseGlassEl || null;
  _btns.nextGlass    = elements.btnNextGlassEl     || null;
  _btns.prevMini     = elements.btnPrevMiniEl      || null;
  _btns.playPauseMini = elements.btnPlayPauseMiniEl || null;
  _btns.nextMini     = elements.btnNextMiniEl      || null;
  _btns.miniCollapse = elements.btnMiniCollapseEl  || null;

  const pairs = [
    [_btns.prev,          'previous'],
    [_btns.next,          'next'],
    [_btns.playPause,     'playpause'],
    [_btns.prevGlass,     'previous'],
    [_btns.nextGlass,     'next'],
    [_btns.playPauseGlass,'playpause'],
    [_btns.prevMini,      'previous'],
    [_btns.nextMini,      'next'],
    [_btns.playPauseMini, 'playpause']
  ];

  for (const [btn, action] of pairs) {
    if (btn) btn.addEventListener('click', _clickHandler(action));
  }

  if (_btns.miniCollapse) {
    _btns.miniCollapse.addEventListener('mousedown', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      if (onMiniCollapseViewChange) onMiniCollapseViewChange();
    });
  }
}

module.exports = { init, updateTransportUi, setTransportEnabled };
