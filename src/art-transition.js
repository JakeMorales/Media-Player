'use strict';

// ---------------------------------------------------------------------------
// Art transition — record burn-in, sleeve cross-dissolve, and mini-art fade.
//
// Call init() once with the relevant image elements, then use handleMetaUpdate()
// from setMetadata(). The module manages the debounce + pending-art-key state
// internally so the calling code stays clean.
// ---------------------------------------------------------------------------

let _recordArtEl = null;
let _recordArtNewEl = null;
let _sleeveArtEl = null;
let _sleeveArtNewEl = null;
let _miniArtEl = null;

let _artBurnGen = 0;
let _transDebounce = null;
let _pendingArtKey = null;
let _getTrackKey = null; // () => string — read the *current* live track key

// Runs the full record-burn + sleeve-dissolve + mini-fade transition.
// Only called once artwork for the incoming track is confirmed present.
function _doArtTransition(meta) {
  const gen = ++_artBurnGen;

  // ── Record art ─────────────────────────────────────────────────────────
  if (_recordArtEl) {
    if (_recordArtNewEl) {
      if (meta.artwork) _recordArtNewEl.src = meta.artwork;
      else _recordArtNewEl.removeAttribute('src');
    }
    if (!_recordArtEl.dataset.burning) {
      requestAnimationFrame(() => requestAnimationFrame(() => {
        if (_artBurnGen !== gen) return;
        _recordArtEl.dataset.burning = 'true';
      }));
    }
    setTimeout(() => {
      if (_artBurnGen !== gen) return;
      const finalize = () => {
        _recordArtEl.removeAttribute('data-burning');
        requestAnimationFrame(() => {
          if (_recordArtNewEl) _recordArtNewEl.removeAttribute('src');
        });
      };
      if (meta.artwork) {
        _recordArtEl.src = meta.artwork;
        const dp = _recordArtEl.decode ? _recordArtEl.decode() : Promise.reject();
        dp.then(() => { if (_artBurnGen === gen) finalize(); })
          .catch(() => { if (_artBurnGen === gen) finalize(); });
      } else {
        _recordArtEl.removeAttribute('src');
        finalize();
      }
    }, 930);
  }

  // ── Sleeve art ─────────────────────────────────────────────────────────
  if (_sleeveArtEl) {
    if (_sleeveArtNewEl) {
      if (meta.artwork) _sleeveArtNewEl.src = meta.artwork;
      else _sleeveArtNewEl.removeAttribute('src');
      _sleeveArtEl.dataset.changing = 'true';
      const startDissolve = () => {
        _sleeveArtNewEl.onload = null;
        _sleeveArtNewEl.onerror = null;
        requestAnimationFrame(() => requestAnimationFrame(() => {
          _sleeveArtNewEl.dataset.visible = 'true';
        }));
        setTimeout(() => {
          if (meta.artwork) {
            _sleeveArtEl.src = meta.artwork;
            const finishSleeve = () => {
              _sleeveArtEl.removeAttribute('data-changing');
              _sleeveArtNewEl.removeAttribute('data-visible');
              setTimeout(() => _sleeveArtNewEl.removeAttribute('src'), 460);
            };
            const sd = _sleeveArtEl.decode ? _sleeveArtEl.decode() : Promise.reject();
            sd.then(finishSleeve).catch(finishSleeve);
          } else {
            _sleeveArtEl.removeAttribute('src');
            _sleeveArtEl.removeAttribute('data-changing');
            _sleeveArtNewEl.removeAttribute('data-visible');
            _sleeveArtNewEl.removeAttribute('src');
          }
        }, 380);
      };
      if (!meta.artwork || _sleeveArtNewEl.complete) {
        startDissolve();
      } else {
        _sleeveArtNewEl.onload = startDissolve;
        _sleeveArtNewEl.onerror = startDissolve;
      }
    } else {
      _sleeveArtEl.dataset.changing = 'true';
      setTimeout(() => {
        if (meta.artwork) _sleeveArtEl.src = meta.artwork;
        else _sleeveArtEl.removeAttribute('src');
        requestAnimationFrame(() => requestAnimationFrame(() =>
          _sleeveArtEl.removeAttribute('data-changing')
        ));
      }, 360);
    }
  }

  // ── Mini art ───────────────────────────────────────────────────────────
  if (_miniArtEl) {
    _miniArtEl.dataset.changing = 'true';
    setTimeout(() => {
      if (meta.artwork) _miniArtEl.src = meta.artwork;
      else _miniArtEl.removeAttribute('src');
      requestAnimationFrame(() => requestAnimationFrame(() =>
        _miniArtEl.removeAttribute('data-changing')
      ));
    }, 200);
  }
}

// Called from setMetadata() every time metadata arrives.
// Handles debouncing for rapid skips and holds for missing artwork.
function handleMetaUpdate(meta, trackKey, isNewTrack) {
  const pendingArtFired = (_pendingArtKey === trackKey) && !!meta.artwork;
  if (pendingArtFired) _pendingArtKey = null;

  if (isNewTrack) {
    if (_transDebounce) { clearTimeout(_transDebounce); _transDebounce = null; }
    _pendingArtKey = null;

    const capMeta = meta;
    const capKey  = trackKey;
    _transDebounce = setTimeout(() => {
      _transDebounce = null;
      // If the live track moved on again during the 80 ms debounce, abort.
      if (_getTrackKey && _getTrackKey() !== capKey) return;
      if (capMeta.artwork) {
        _doArtTransition(capMeta);
      } else {
        _pendingArtKey = capKey;
      }
    }, 80);

  } else if (pendingArtFired) {
    _doArtTransition(meta);

  } else {
    // Same track, plain metadata refresh — update srcs without animating.
    if (meta.artwork) {
      if (_sleeveArtEl) _sleeveArtEl.src = meta.artwork;
      if (_recordArtEl) _recordArtEl.src = meta.artwork;
      if (_miniArtEl)   _miniArtEl.src   = meta.artwork;
    }
  }
}

// elements: { recordArtEl, recordArtNewEl, sleeveArtEl, sleeveArtNewEl, miniArtEl }
// getTrackKey: () => string  — returns the current playbackProgressState.trackKey
function init(elements, getTrackKey) {
  _recordArtEl    = elements.recordArtEl    || null;
  _recordArtNewEl = elements.recordArtNewEl || null;
  _sleeveArtEl    = elements.sleeveArtEl    || null;
  _sleeveArtNewEl = elements.sleeveArtNewEl || null;
  _miniArtEl      = elements.miniArtEl      || null;
  _getTrackKey    = getTrackKey             || null;
}

module.exports = { init, handleMetaUpdate };
