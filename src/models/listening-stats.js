'use strict';

// listening-stats.js — Data models for Phase 2 "Music Identity Layer".
// These are pure data shapes and helpers; no service or UI dependencies.

/**
 * @typedef {Object} TrackRef
 * @property {string} id           Stable internal track identifier (hash or GUID).
 * @property {string} title        Normalised track title.
 * @property {string} artist       Primary artist name.
 * @property {string} [album]      Optional album title.
 * @property {string} [sourceId]   Logical source: 'spotify' | 'apple' | 'youtube' | 'browser' | 'local' | 'unknown'.
 */

/**
 * Raw listening event for a single contiguous play session of a track.
 *
 * @typedef {Object} ListeningSample
 * @property {string} id           Sample id (e.g. `${trackId}:${startedAt}`).
 * @property {TrackRef} track      Track reference.
 * @property {number} startedAt    UTC millis when playback started.
 * @property {number} endedAt      UTC millis when playback stopped/paused.
 * @property {number} durationMs   Derived: max(0, endedAt - startedAt).
 * @property {number} [progressPct] Normalised completion 0–1 when stopped.
 * @property {string} [deviceId]   Optional device identifier.
 */

/**
 * Aggregated stats for a time bucket (day / week / month).
 *
 * @typedef {Object} ListeningStatsSnapshot
 * @property {string} id             Unique snapshot id (e.g. `day:2026-06-07`).
 * @property {('day'|'week'|'month')} period
 * @property {string} dateKey        ISO date for the bucket start (YYYY-MM-DD).
 * @property {number} windowStartMs  Inclusive UTC millis for the bucket start.
 * @property {number} windowEndMs    Exclusive UTC millis for the bucket end.
 * @property {number} totalMs        Total listening time in this window.
 * @property {number} totalPlays     Number of full/partial plays.
 * @property {number} uniqueTracks   Unique track count.
 * @property {number} uniqueArtists  Unique artist count.
 * @property {Object.<string, number>} bySourceMs  Listening time per sourceId.
 * @property {Object.<string, number>} byGenreMs   Listening time per genre (if known).
 * @property {{ energy: number, valence: number }} mood  Normalised 0–1 mood scores.
 * @property {string[]} topTrackIds  Ranked list of top track ids for this window.
 * @property {string[]} topArtistNames Ranked list of top artists.
 * @property {boolean} isStreakEligible Whether this bucket counts towards a listening streak.
 */

/**
 * Create a normalised TrackRef.
 *
 * @param {Partial<TrackRef>} input
 * @returns {TrackRef}
 */
function createTrackRef(input) {
  const title = (input.title || '').trim() || 'Unknown Track';
  const artist = (input.artist || '').trim() || 'Unknown Artist';
  const album = (input.album || '').trim();
  const sourceId = input.sourceId && typeof input.sourceId === 'string'
    ? input.sourceId
    : 'unknown';
  const id = input.id && typeof input.id === 'string' && input.id.trim()
    ? input.id.trim()
    : `${title.toLowerCase()}|${artist.toLowerCase()}|${album.toLowerCase()}|${sourceId}`;

  return { id, title, artist, album, sourceId };
}

/**
 * Create a ListeningSample from raw timestamps.
 *
 * @param {Object} input
 * @param {TrackRef|Partial<TrackRef>} input.track
 * @param {number} input.startedAt
 * @param {number} input.endedAt
 * @param {number} [input.progressPct]
 * @param {string} [input.deviceId]
 * @returns {ListeningSample}
 */
function createListeningSample(input) {
  const startedAt = Number(input.startedAt) || 0;
  const endedAt = Number(input.endedAt) || startedAt;
  const durationMs = Math.max(0, endedAt - startedAt);
  const track = createTrackRef(input.track || {});
  const baseId = `${track.id}:${startedAt}`;

  return {
    id: baseId,
    track,
    startedAt,
    endedAt,
    durationMs,
    progressPct: typeof input.progressPct === 'number'
      ? Math.min(1, Math.max(0, input.progressPct))
      : undefined,
    deviceId: input.deviceId || undefined
  };
}

/**
 * Create an empty stats snapshot for the given period/window.
 *
 * @param {Object} params
 * @param {('day'|'week'|'month')} params.period
 * @param {string} params.dateKey
 * @param {number} params.windowStartMs
 * @param {number} params.windowEndMs
 * @returns {ListeningStatsSnapshot}
 */
function createEmptyStatsSnapshot(params) {
  const period = params.period === 'week' || params.period === 'month'
    ? params.period
    : 'day';
  const dateKey = params.dateKey || '1970-01-01';
  const id = `${period}:${dateKey}`;

  return {
    id,
    period,
    dateKey,
    windowStartMs: Number(params.windowStartMs) || 0,
    windowEndMs: Number(params.windowEndMs) || 0,
    totalMs: 0,
    totalPlays: 0,
    uniqueTracks: 0,
    uniqueArtists: 0,
    bySourceMs: Object.create(null),
    byGenreMs: Object.create(null),
    mood: { energy: 0, valence: 0 },
    topTrackIds: [],
    topArtistNames: [],
    isStreakEligible: false
  };
}

module.exports = {
  createTrackRef,
  createListeningSample,
  createEmptyStatsSnapshot
};
