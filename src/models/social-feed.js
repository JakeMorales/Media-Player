'use strict';

// social-feed.js — Data models for Phase 3 "Social Layer". These are
// intentionally decoupled from any transport (WebSocket, HTTP) and UI.

/**
 * @typedef {Object} SocialUser
 * @property {string} id           Internal user id.
 * @property {string} displayName  Public display name.
 * @property {string} [avatarUrl]  Optional avatar.
 */

/**
 * Friend/peer activity feed item. The `kind` field determines which
 * discriminator payload is populated.
 *
 * @typedef {Object} FriendActivityItem
 * @property {string} id
 * @property {('now-playing'|'recently-played'|'weekly-summary'|'streak'|'overlap'|'group-vibe'|'leaderboard')} kind
 * @property {number} createdAtMs         UTC millis when item was created.
 * @property {SocialUser} owner          The user this item is about.
 * @property {Object} payload            Shape depends on `kind`.
 */

/**
 * @typedef {Object} NowPlayingPayload
 * @property {string} trackTitle
 * @property {string} artistName
 * @property {string} [albumTitle]
 * @property {string} [sourceId]
 * @property {number} [progressPct]
 */

/**
 * @typedef {Object} WeeklySummaryPayload
 * @property {string} weekId            e.g. '2026-W01'.
 * @property {number} totalMs
 * @property {string[]} topTrackTitles
 * @property {string[]} topArtistNames
 * @property {string[]} genres
 */

/**
 * @typedef {Object} StreakPayload
 * @property {number} lengthDays
 * @property {string} startedDate       ISO date YYYY-MM-DD.
 * @property {string} lastActiveDate    ISO date YYYY-MM-DD.
 */

/**
 * @typedef {Object} OverlapPayload
 * @property {SocialUser} otherUser
 * @property {number} overlapScore      0–1 similarity of listening.
 * @property {string[]} sharedTracks    Optional shared track labels.
 */

/**
 * @typedef {Object} GroupVibePayload
 * @property {SocialUser[]} participants
 * @property {string} title
 * @property {{ energy: number, valence: number }} mood
 */

/**
 * @typedef {Object} LeaderboardPayload
 * @property {string} metric            e.g. 'totalMs-week', 'streak-days'.
 * @property {{ user: SocialUser, value: number }[]} entries
 */

/**
 * Create a SocialUser model.
 * @param {Object} input
 * @returns {SocialUser}
 */
function createSocialUser(input) {
  return {
    id: String(input.id || '').trim() || 'unknown-user',
    displayName: String(input.displayName || '').trim() || 'Unknown Listener',
    avatarUrl: input.avatarUrl || undefined
  };
}

/**
 * Factory for FriendActivityItem. The payload is left as-is; callers should
 * provide a shape that matches the `kind` they choose.
 *
 * @param {Object} input
 * @param {string} input.id
 * @param {FriendActivityItem['kind']} input.kind
 * @param {number} input.createdAtMs
 * @param {SocialUser|Object} input.owner
 * @param {Object} input.payload
 * @returns {FriendActivityItem}
 */
function createFriendActivityItem(input) {
  const owner = createSocialUser(input.owner || {});
  const allowedKinds = new Set([
    'now-playing',
    'recently-played',
    'weekly-summary',
    'streak',
    'overlap',
    'group-vibe',
    'leaderboard'
  ]);

  const kind = allowedKinds.has(input.kind) ? input.kind : 'recently-played';
  const id = String(input.id || '').trim() || `${kind}:${input.createdAtMs || Date.now()}`;

  return {
    id,
    kind,
    createdAtMs: Number(input.createdAtMs) || Date.now(),
    owner,
    payload: input.payload && typeof input.payload === 'object'
      ? Object.assign({}, input.payload)
      : {}
  };
}

module.exports = {
  createSocialUser,
  createFriendActivityItem
};
