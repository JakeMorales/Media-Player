'use strict';

// aggregator.js — Helpers to turn ListeningSample records into
// ListeningStatsSnapshot structures. Pure functions only; no IO.

const { createEmptyStatsSnapshot } = require('../models/listening-stats');

function _toDateKey(utcMillis) {
  const d = new Date(utcMillis);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Group samples by UTC calendar day, based on startedAt.
function groupSamplesByDay(samples) {
  const byDay = new Map();
  for (const s of samples || []) {
    const key = _toDateKey(s.startedAt || 0);
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key).push(s);
  }
  return byDay;
}

// Build daily ListeningStatsSnapshot objects from a list of samples.
function buildDailySnapshots(samples) {
  const byDay = groupSamplesByDay(samples);
  const snapshots = [];

  for (const [dateKey, daySamples] of byDay.entries()) {
    if (!daySamples.length) continue;
    const dayStart = Date.parse(`${dateKey}T00:00:00.000Z`);
    const dayEnd = dayStart + 24 * 60 * 60 * 1000;

    const snap = createEmptyStatsSnapshot({
      period: 'day',
      dateKey,
      windowStartMs: dayStart,
      windowEndMs: dayEnd
    });

    const trackMs = new Map();
    const artistMs = new Map();

    for (const s of daySamples) {
      const duration = s.durationMs || 0;
      if (duration <= 0) continue;

      snap.totalMs += duration;
      snap.totalPlays += 1;

      const trackId = s.track && s.track.id ? s.track.id : null;
      const artistName = s.track && s.track.artist ? s.track.artist : null;
      const sourceId = s.track && s.track.sourceId ? s.track.sourceId : 'unknown';

      if (trackId) {
        trackMs.set(trackId, (trackMs.get(trackId) || 0) + duration);
      }
      if (artistName) {
        artistMs.set(artistName, (artistMs.get(artistName) || 0) + duration);
      }
      snap.bySourceMs[sourceId] = (snap.bySourceMs[sourceId] || 0) + duration;
    }

    snap.uniqueTracks = trackMs.size;
    snap.uniqueArtists = artistMs.size;

    snap.topTrackIds = Array.from(trackMs.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([id]) => id);

    snap.topArtistNames = Array.from(artistMs.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([name]) => name);

    // Basic streak-eligibility heuristic: listening for at least 10 minutes.
    snap.isStreakEligible = snap.totalMs >= 10 * 60 * 1000;

    snapshots.push(snap);
  }

  return snapshots;
}

module.exports = {
  groupSamplesByDay,
  buildDailySnapshots
};
