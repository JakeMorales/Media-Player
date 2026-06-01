'use strict';

// ---------------------------------------------------------------------------
// Canvas spectrum renderers — glass ring (lid view) and mini bar strip.
// Both renderers share a clamp helper and are driven from the RAF loop.
// ---------------------------------------------------------------------------

function clamp(v, min, max) { return Math.min(max, Math.max(min, v)); }

// Injected at init
let _glassSpectrumEl = null;
let _miniSpectrumEl  = null;
let _miniArtEl       = null;
let _recordEl        = null;
let _getView         = null; // () => currentView string

const _glass = {
  ctx: null,
  width: 0, height: 0, dpr: 1,
  centerX: 0, centerY: 0, recordRadius: 0,
  levels: new Float32Array(64),
  bass: 0, idlePhase: 0,
  geomStamp: ''
};

const _mini = {
  ctx: null,
  width: 0, height: 0, dpr: 1,
  levels: new Float32Array(24),
  phase: 0
};

// ── Glass spectrum ──────────────────────────────────────────────────────────

function updateGlassSpectrumGeometry(force) {
  if (!_glassSpectrumEl || !_recordEl || !_glass.ctx) return;

  const rect = _glassSpectrumEl.getBoundingClientRect();
  if (rect.width < 2 || rect.height < 2) return;
  const dpr    = Math.max(1, window.devicePixelRatio || 1);
  const width  = Math.max(1, Math.round(rect.width  * dpr));
  const height = Math.max(1, Math.round(rect.height * dpr));
  if (force || _glass.width !== width || _glass.height !== height || _glass.dpr !== dpr) {
    _glassSpectrumEl.width  = width;
    _glassSpectrumEl.height = height;
    _glass.width  = width;
    _glass.height = height;
    _glass.dpr    = dpr;
  }

  const canvasRect = _glassSpectrumEl.getBoundingClientRect();
  const recordRect = _recordEl.getBoundingClientRect();
  const centerX    = ((recordRect.left + recordRect.width  * 0.5) - canvasRect.left) * dpr;
  const centerY    = ((recordRect.top  + recordRect.height * 0.5) - canvasRect.top)  * dpr;
  const recordRadius = Math.max(24, recordRect.width * 0.5 * dpr);

  const stamp = `${Math.round(centerX)}:${Math.round(centerY)}:${Math.round(recordRadius)}:${width}:${height}`;
  if (force || stamp !== _glass.geomStamp) {
    _glass.centerX      = centerX;
    _glass.centerY      = centerY;
    _glass.recordRadius = recordRadius;
    _glass.geomStamp    = stamp;
  }
}

function renderGlassSpectrum(freqData, active, level) {
  if (!_glassSpectrumEl || !_glass.ctx) return;

  const view = _getView ? _getView() : 'full';
  if (view !== 'lid') {
    if (_glass.width > 0 && _glass.height > 0) {
      _glass.ctx.clearRect(0, 0, _glass.width, _glass.height);
    }
    return;
  }

  updateGlassSpectrumGeometry(false);
  const ctx = _glass.ctx;
  const { width, height, centerX, centerY, recordRadius, levels } = _glass;
  if (width < 2 || height < 2 || recordRadius < 2) return;

  const dpr = _glass.dpr;
  ctx.clearRect(0, 0, width, height);

  const bars     = levels.length; // 64
  const halfBars = bars / 2;
  const freqMax  = Math.max(16, Math.floor(freqData.length * 0.72));

  _glass.idlePhase += 0.016;

  // ── Bass pulse ring ───────────────────────────────────────────────────
  const bassBins = Math.min(10, freqData.length);
  let bassSum = 0;
  for (let b = 0; b < bassBins; b++) bassSum += freqData[b];
  const bassNow = clamp(bassSum / bassBins / 255, 0, 1);
  _glass.bass = _glass.bass * 0.84 + bassNow * 0.16;
  const br        = _glass.bass;
  const ringAlpha = clamp(0.2 + br * 0.42, 0.16, 0.62);
  const ringR     = recordRadius + (1 + br * 4) * dpr;
  ctx.beginPath();
  ctx.arc(centerX, centerY, ringR, 0, Math.PI * 2);
  ctx.strokeStyle  = `rgba(126, 209, 255, ${ringAlpha.toFixed(3)})`;
  ctx.lineWidth    = (1.2 + br * 3) * dpr;
  ctx.shadowColor  = `rgba(96, 198, 255, ${(ringAlpha * 0.85).toFixed(3)})`;
  ctx.shadowBlur   = (6 + br * 18) * dpr;
  ctx.stroke();
  ctx.shadowBlur = 0;

  // ── Rotating concentric ring lattice ─────────────────────────────────
  const ringCount = 3;
  const baseRot   = _glass.idlePhase * (0.8 + br * 0.9);
  for (let r = 0; r < ringCount; r++) {
    const rr     = recordRadius + (7 + r * 8 + Math.sin(_glass.idlePhase * (1.1 + r * 0.23)) * (0.9 + br * 1.8)) * dpr;
    const segs   = 72;
    const a0     = baseRot * (r % 2 === 0 ? 1 : -1) + r * 0.8;
    const aAlpha = clamp(0.16 + br * 0.26 - r * 0.03, 0.08, 0.38);

    ctx.beginPath();
    for (let s = 0; s <= segs; s++) {
      const t      = s / segs;
      const a      = a0 + t * Math.PI * 2;
      const wobble = Math.sin(a * (2 + r) + _glass.idlePhase * (1.4 + r * 0.2)) * (0.7 + br * 1.8) * dpr;
      const x      = centerX + Math.cos(a) * (rr + wobble);
      const y      = centerY + Math.sin(a) * (rr + wobble);
      if (s === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.lineWidth   = (0.9 + r * 0.18) * dpr;
    ctx.strokeStyle = `rgba(${r === 1 ? '78, 187, 255' : '97, 226, 241'}, ${aAlpha.toFixed(3)})`;
    ctx.stroke();
  }

  // ── 360° symmetric radial bars ────────────────────────────────────────
  const baseGap   = 4 * dpr;
  const maxBarLen = 24 * dpr;

  for (let i = 0; i < bars; i++) {
    const half  = i < halfBars ? i : bars - 1 - i;
    const norm  = half / (halfBars - 1); // 0 = top, 1 = bottom
    const side  = i < halfBars ? 1 : -1;
    const angle = -Math.PI / 2 + side * norm * Math.PI;

    const t   = Math.pow(norm, 0.8);
    const bin = Math.min(freqData.length - 1, Math.floor(1 + t * (freqMax - 1)));
    const raw = clamp(freqData[bin] / 255, 0, 1);
    const idleTarget = (0.055 + Math.sin(_glass.idlePhase + norm * Math.PI * 2) * 0.02) * (1 - norm * 0.3);
    const target = active ? raw * 0.95 : idleTarget;
    const resp   = target > levels[i] ? 0.26 : 0.11;
    levels[i] += (target - levels[i]) * resp;

    const amp = Math.pow(levels[i], 0.64);
    const r1  = recordRadius + baseGap;
    const r2  = recordRadius + baseGap + amp * maxBarLen;
    const x1  = centerX + Math.cos(angle) * r1;
    const y1  = centerY + Math.sin(angle) * r1;
    const x2  = centerX + Math.cos(angle) * r2;
    const y2  = centerY + Math.sin(angle) * r2;

    const grad  = ctx.createLinearGradient(x1, y1, x2, y2);
    const baseA = clamp(0.48 + amp * 0.40, 0.38, 0.90);
    const tipA  = clamp(amp * 0.18, 0, 0.24);
    const col   = active ? '132, 222, 255' : '92, 184, 234';
    grad.addColorStop(0, `rgba(${col}, ${baseA.toFixed(3)})`);
    grad.addColorStop(1, `rgba(${col}, ${tipA.toFixed(3)})`);

    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.lineWidth   = clamp((0.9 + amp * 1.8) * dpr, 0.8 * dpr, 3.2 * dpr);
    ctx.lineCap     = 'round';
    ctx.strokeStyle = grad;
    ctx.stroke();
  }
}

// ── Mini spectrum ───────────────────────────────────────────────────────────

function renderMiniSpectrum(freqData, active) {
  if (!_mini.ctx || !_miniSpectrumEl || !_miniArtEl) return;

  const view = _getView ? _getView() : 'full';
  if (view !== 'mini' && view !== 'mini-lid') {
    if (_mini.width > 0 && _mini.height > 0) {
      _mini.ctx.clearRect(0, 0, _mini.width, _mini.height);
    }
    return;
  }

  const rect = _miniSpectrumEl.getBoundingClientRect();
  if (rect.width < 2 || rect.height < 2) return;
  const dpr    = Math.max(1, window.devicePixelRatio || 1);
  const width  = Math.max(1, Math.round(rect.width  * dpr));
  const height = Math.max(1, Math.round(rect.height * dpr));
  if (_mini.width !== width || _mini.height !== height || _mini.dpr !== dpr) {
    _miniSpectrumEl.width  = width;
    _miniSpectrumEl.height = height;
    _mini.width  = width;
    _mini.height = height;
    _mini.dpr    = dpr;
  }

  const ctx = _mini.ctx;
  ctx.clearRect(0, 0, width, height);
  _mini.phase += 0.02;

  const levels   = _mini.levels;
  const bars     = levels.length;
  const span     = width * 0.86;
  const startX   = (width - span) * 0.5;
  const w        = span / bars;
  const baseline = height * 0.88;
  const maxH     = height * 0.45;

  for (let i = 0; i < bars; i++) {
    const t   = i / Math.max(1, bars - 1);
    const bin = Math.min(freqData.length - 1, Math.floor(Math.pow(t, 0.82) * (freqData.length * 0.58)));
    const raw = clamp(freqData[bin] / 255, 0, 1);
    const idle   = 0.03 + Math.sin(_mini.phase + i * 0.26) * 0.015;
    const target = active ? raw : idle;
    const rate   = target > levels[i] ? 0.32 : 0.12;
    levels[i] += (target - levels[i]) * rate;
    const amp = Math.pow(levels[i], 0.72);
    const h   = Math.max(1 * dpr, amp * maxH);

    const x    = startX + i * w;
    const grad = ctx.createLinearGradient(x, baseline - h, x, baseline);
    grad.addColorStop(0, 'rgba(202, 238, 255, 0.85)');
    grad.addColorStop(1, 'rgba(120, 174, 233, 0.18)');
    ctx.fillStyle = grad;
    ctx.fillRect(x, baseline - h, Math.max(1, w * 0.68), h);
  }
}

// ── Public init ─────────────────────────────────────────────────────────────

// elements: { glassSpectrumEl, miniSpectrumEl, miniArtEl, recordEl }
// getView:  () => string — returns current view name ('full' | 'lid' | 'mini' | 'mini-lid')
function init(elements, getView) {
  _glassSpectrumEl = elements.glassSpectrumEl || null;
  _miniSpectrumEl  = elements.miniSpectrumEl  || null;
  _miniArtEl       = elements.miniArtEl       || null;
  _recordEl        = elements.recordEl        || null;
  _getView         = getView                  || null;

  _glass.ctx = _glassSpectrumEl ? _glassSpectrumEl.getContext('2d') : null;
  _mini.ctx  = _miniSpectrumEl  ? _miniSpectrumEl.getContext('2d')  : null;
}

module.exports = { init, updateGlassSpectrumGeometry, renderGlassSpectrum, renderMiniSpectrum };
