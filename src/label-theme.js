'use strict';

// ---------------------------------------------------------------------------
// Record label colour theme — artwork colour sampling, HSL/RGB math, and
// applying the derived palette as CSS custom properties.
// ---------------------------------------------------------------------------

const FALLBACK_PALETTES = [
  { base: [246, 223, 24], ring: [215, 72, 54], panel: [255, 248, 216], ink: [20, 24, 35] },
  { base: [242, 97, 52], ring: [171, 40, 42], panel: [255, 237, 224], ink: [26, 18, 20] },
  { base: [85, 163, 221], ring: [52, 94, 176], panel: [233, 244, 255], ink: [17, 28, 46] },
  { base: [77, 176, 121], ring: [44, 112, 73], panel: [233, 248, 237], ink: [16, 32, 23] },
  { base: [231, 181, 66], ring: [148, 83, 38], panel: [255, 243, 214], ink: [34, 24, 13] }
];

const _cache = new Map();
let _token = 0;
let _rootStyle = null;

function clamp(v, min, max) { return Math.min(max, Math.max(min, v)); }

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

function themeFromKey(meta) {
  const key = `${meta.title || ''}|${meta.artist || ''}`;
  const idx = hashString(key) % FALLBACK_PALETTES.length;
  return FALLBACK_PALETTES[idx];
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
    if (!url) { reject(new Error('No artwork URL')); return; }

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    img.onload = () => {
      try {
        const W = 28;
        const H = 28;
        const canvas = document.createElement('canvas');
        canvas.width = W;
        canvas.height = H;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) throw new Error('Canvas context unavailable');
        ctx.drawImage(img, 0, 0, W, H);
        const data = ctx.getImageData(0, 0, W, H).data;

        let rSum = 0, gSum = 0, bSum = 0, weightSum = 0;
        for (let i = 0; i < data.length; i += 4) {
          const a = data[i + 3] / 255;
          if (a < 0.85) continue;
          const r = data[i], g = data[i + 1], b = data[i + 2];
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

function setLabelTheme(theme) {
  _rootStyle.setProperty('--label-base-rgb', theme.base.join(', '));
  _rootStyle.setProperty('--label-ring-rgb', theme.ring.join(', '));
  _rootStyle.setProperty('--label-panel-rgb', theme.panel.join(', '));
  _rootStyle.setProperty('--label-ink-rgb', theme.ink.join(', '));
  const panelLum = (0.2126 * theme.panel[0] + 0.7152 * theme.panel[1] + 0.0722 * theme.panel[2]) / 255;
  if (panelLum > 0.64) {
    _rootStyle.setProperty('--record-groove-rgb', '38, 44, 58');
    _rootStyle.setProperty('--record-groove-alpha', '0.2');
  } else {
    _rootStyle.setProperty('--record-groove-rgb', '236, 245, 255');
    _rootStyle.setProperty('--record-groove-alpha', '0.24');
  }
}

async function applyRecordLabelTheme(meta) {
  const token = ++_token;
  const artwork = meta.artwork || '';
  try {
    if (!artwork) throw new Error('Missing artwork');
    let theme = _cache.get(artwork);
    if (!theme) {
      const avg = await sampleArtworkAverageColor(artwork);
      theme = themeFromArtworkAvg(avg);
      _cache.set(artwork, theme);
    }
    if (token !== _token) return;
    setLabelTheme(theme);
  } catch {
    if (token !== _token) return;
    setLabelTheme(themeFromKey(meta));
  }
}

function fitLabelText(value, maxLen) {
  const s = (value || '').replace(/\s+/g, ' ').trim();
  if (!s) return '';
  if (s.length <= maxLen) return s;
  return `${s.slice(0, maxLen - 1)}...`;
}

function init(rootStyle) {
  _rootStyle = rootStyle;
}

module.exports = { init, applyRecordLabelTheme, setLabelTheme, themeFromKey, fitLabelText };
