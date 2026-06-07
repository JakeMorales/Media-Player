'use strict';

// visualizer-controller.js — Manages visualizer mode selection and
// configuration on top of the base config. Keeps the API to visualizer.js
// unchanged while allowing future UI-driven mode switching.

const VALID_MODES = ['bars', 'waveform', 'shader'];

let _baseCfg = null;
let _mode = 'bars';
let _initialised = false;

function _loadPersistedMode() {
  try {
    const stored = window.localStorage.getItem('mp_visualizer_mode');
    if (stored && VALID_MODES.includes(stored)) {
      _mode = stored;
    }
  } catch (_) {
    // Ignore storage errors (private mode, disabled storage, etc.)
  }
}

function _saveMode() {
  try {
    window.localStorage.setItem('mp_visualizer_mode', _mode);
  } catch (_) {
    // Non-fatal if persistence fails
  }
}

// Initialise with the base config object from config.js.
// Returns an effective config object for the current visualizer mode.
function init(baseCfg) {
  if (_initialised && _baseCfg) return getConfig();
  _baseCfg = Object.assign({}, baseCfg || {});
  _mode = VALID_MODES.includes(_baseCfg.mode) ? _baseCfg.mode : 'bars';
  _loadPersistedMode();
  _initialised = true;
  return getConfig();
}

// Returns the current effective config (shallow copy).
function getConfig() {
  if (!_baseCfg) throw new Error('visualizer-controller not initialised');
  return Object.assign({}, _baseCfg, { mode: _mode });
}

function getMode() {
  return _mode;
}

// Change mode and persist to localStorage. Invalid values are ignored.
// Returns the resulting mode (previous value if ignored).
function setMode(mode) {
  if (!VALID_MODES.includes(mode)) return _mode;
  if (mode === _mode) return _mode;
  _mode = mode;
  _saveMode();
  return _mode;
}

module.exports = {
  init,
  getConfig,
  getMode,
  setMode,
  VALID_MODES
};
