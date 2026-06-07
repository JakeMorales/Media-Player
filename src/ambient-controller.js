'use strict';

// ambient-controller.js — Lightweight policy for ambient overlay behaviour.
// Decides when to transition from the full deck view into the lid view based
// on audio activity, playback state, and user hover. It is intentionally
// conservative and one-way: it only moves from `full` → `lid` and never
// forces the widget back to `full` so that manual user choices are respected.

// Internal state
let _idleToLidMs = 60000; // default: 60s of inactivity before lid
let _lastInteractionAt = 0;
let _initialised = false;

function init(options) {
  const now = (typeof performance !== 'undefined' && performance.now)
    ? performance.now()
    : Date.now();
  _idleToLidMs = options && Number.isFinite(options.idleToLidMs)
    ? Math.max(10000, options.idleToLidMs) // clamp to sensible minimum
    : 60000;
  _lastInteractionAt = now;
  _initialised = true;
}

// Called from the RAF loop. Returns either `null` (no change) or the name of
// the view the controller suggests (currently only 'lid').
//
// params: {
//   now: number (ms),
//   active: boolean,        // audio activity from FFT
//   level: number,          // 0–1 audio level
//   playing: boolean,       // playback state from player
//   currentView: string,    // 'full' | 'lid' | 'mini' | 'mini-lid'
//   hovering: boolean       // whether the pointer is currently over widget
// }
function nextView(params) {
  if (!_initialised) init();

  const now = params.now;
  const active = !!params.active;
  const playing = !!params.playing;
  const currentView = params.currentView || 'full';
  const hovering = !!params.hovering;

  // Any recent meaningful activity counts as interaction
  if (hovering || active || playing) {
    _lastInteractionAt = now;
    return null;
  }

  if (currentView !== 'full') return null;

  const idleFor = now - _lastInteractionAt;
  if (idleFor >= _idleToLidMs) {
    _lastInteractionAt = now; // avoid retriggering every frame
    return 'lid';
  }

  return null;
}

module.exports = { init, nextView };
