'use strict';

// vibes.js — Data models for "Vibe" badges and summaries (Phase 2).
// Pure data structures derived from listening stats; no UI or service logic.

/**
 * @typedef {Object} VibeBadge
 * @property {string} id              Stable id (e.g. 'night-owl', 'basshead').
 * @property {string} label           Human label for display.
 * @property {string} description     Short explanation of why the user earned it.
 * @property {('daily'|'weekly'|'monthly'|'lifetime')} scope
 * @property {string} [icon]          Optional icon key for UI themes.
 * @property {Object} criteria        Normalised criteria that were met.
 */

/**
 * @typedef {Object} VibeSummary
 * @property {string} id                e.g. 'week:2026-W01'.
 * @property {('week'|'month'|'lifetime')} period
 * @property {string} title             e.g. 'Late-night synthwave', 'Chill Sunday'.
 * @property {{ energy: number, valence: number }} mood
 * @property {string[]} dominantGenres  Genre names sorted by weight.
 * @property {string[]} dominantArtists Display names of top artists.
 * @property {VibeBadge[]} badges       Badges earned in this window.
 */

/**
 * Convenience helper to build a VibeBadge.
 *
 * @param {Object} input
 * @param {string} input.id
 * @param {string} input.label
 * @param {string} input.description
 * @param {('daily'|'weekly'|'monthly'|'lifetime')} input.scope
 * @param {Object} [input.criteria]
 * @param {string} [input.icon]
 * @returns {VibeBadge}
 */
function createVibeBadge(input) {
  return {
    id: String(input.id || '').trim() || 'unknown-badge',
    label: String(input.label || '').trim() || 'Unknown Vibe',
    description: String(input.description || '').trim() || '',
    scope: input.scope === 'weekly' || input.scope === 'monthly' || input.scope === 'lifetime'
      ? input.scope
      : 'daily',
    icon: input.icon || undefined,
    criteria: input.criteria && typeof input.criteria === 'object'
      ? Object.assign({}, input.criteria)
      : {}
  };
}

/**
 * Convenience helper to build a VibeSummary shell for a given period.
 *
 * @param {Object} input
 * @param {('week'|'month'|'lifetime')} input.period
 * @param {string} input.id
 * @param {string} [input.title]
 * @returns {VibeSummary}
 */
function createVibeSummary(input) {
  const period = input.period === 'month' || input.period === 'lifetime'
    ? input.period
    : 'week';
  const id = String(input.id || '').trim() || `${period}:unknown`;

  return {
    id,
    period,
    title: input.title || '',
    mood: { energy: 0, valence: 0 },
    dominantGenres: [],
    dominantArtists: [],
    badges: []
  };
}

module.exports = {
  createVibeBadge,
  createVibeSummary
};
