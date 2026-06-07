'use strict';

// stats-store.js — Main-process disk-backed store for listening samples.
//
// This module keeps a bounded history of ListeningSample-like objects on disk
// under the app's userData directory. It is accessed from the renderer via
// IPC and should never affect playback or UI if something goes wrong.

const { app } = require('electron');
const fs = require('fs');
const path = require('path');

const MAX_SAMPLES = 5000;

let _samples = [];
let _loaded = false;
let _filePath = null;

function _ensureLoaded() {
  if (_loaded) return;
  try {
    const userDir = app.getPath('userData');
    _filePath = path.join(userDir, 'listening-samples.json');
    if (fs.existsSync(_filePath)) {
      const raw = fs.readFileSync(_filePath, 'utf8');
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.samples)) {
        _samples = parsed.samples;
      }
    }
  } catch (_) {
    // On any failure, fall back to empty in-memory store.
    _samples = [];
  }
  _loaded = true;
}

function _save() {
  try {
    if (!_filePath) {
      const userDir = app.getPath('userData');
      _filePath = path.join(userDir, 'listening-samples.json');
    }
    const payload = JSON.stringify({ samples: _samples }, null, 2);
    fs.writeFileSync(_filePath, payload, 'utf8');
  } catch (_) {
    // Persistence is best-effort; ignore write failures.
  }
}

function getAllSamples() {
  _ensureLoaded();
  return _samples.slice();
}

function appendSamples(samples) {
  _ensureLoaded();
  if (!Array.isArray(samples) || samples.length === 0) return;

  const byId = new Map();
  for (const s of _samples) {
    if (!s || !s.id) continue;
    byId.set(s.id, s);
  }
  for (const s of samples) {
    if (!s || !s.id) continue;
    byId.set(s.id, s);
  }

  _samples = Array.from(byId.values());

  if (_samples.length > MAX_SAMPLES) {
    _samples.sort((a, b) => (a.startedAt || 0) - (b.startedAt || 0));
    _samples = _samples.slice(_samples.length - MAX_SAMPLES);
  }

  _save();
}

module.exports = {
  getAllSamples,
  appendSamples
};
