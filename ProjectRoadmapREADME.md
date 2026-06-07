# Project Roadmap

A high‑level roadmap for building a cross‑service music visualizer and social companion app. Designed to stay fully compliant with Spotify’s platform rules while delivering a rich, expressive user experience.

---

## Phase 1 — Core Visual Experience
- [x] Reactive visualizer modes  
- [x] Spinning vinyl animation  
- [x] Desktop overlay / ambient mode  
- [x] Album art + metadata via OS media APIs  
- [x] Cross‑service compatibility (Spotify, Apple Music, YouTube Music, local players)

**Goal:** Ship a beautiful, universally compatible visual layer with zero API dependencies.

**Implementation status:**  
- Visualizer modes: `audio.js`, `renderer.js`, `visualizer.js`, `visualizer-controller.js`  
- Vinyl deck: `index.html` record layout, `record.css`, `player.js`, `art-transition.js`, `label-theme.js`  
- Desktop overlay / ambient: `main.js` window host, `ui.js` view controller, `ambient-controller.js` one-way full→lid ambient policy  
- Metadata ingestion: `main.js` + `windows-media-sessions`, bridged via IPC to `app.js` / `player.js`  
- Cross-service: Windows Media Sessions, not any single service API, with source labelling via `player.inferSource`

---

## Phase 2 — Music Identity Layer
- Listening stats (daily/weekly/monthly)  
- Weekly summaries  
- Mood + genre breakdowns  
- Listening streaks  
- “Vibe” badges  
- Shareable graphics (vibe cards, summaries)

**Goal:** Build expressive, personalized features that deepen user identity and engagement.

**Data model status:**  
- Listening stats: core models in `src/models/listening-stats.js`  
- Vibes: badge & summary models in `src/models/vibes.js`

**Pipeline status:**  
- Session capture: `src/stats/session-tracker.js` (in-memory ListeningSample log)  
- Aggregation: `src/stats/aggregator.js` (daily ListeningStatsSnapshot builder)  
- Runtime view: `src/stats/runtime-store.js` (refreshable in-session stats cache)  
- Persistence: `src/main/stats-store.js` + IPC handlers in `main.js` (`stats:append-samples`, `stats:get-samples`) for disk history that survives restarts

**UI status:**  
- Phase 2 identity UI is currently **data-only**. An experimental stats shelf / streak UI (`src/identity-panel.js`, `styles/shelf.css`) exists but is disabled in the main branch while core visual stability is prioritised.
  



---

## Phase 3 — Social Layer
- Friend activity feed (Airbuds‑style)  
- “Now Playing” status  
- Friend profiles  
- Listening overlap / compatibility  
- Group vibe summaries  
- Shared streaks  
- Social leaderboards

**Goal:** Add lightweight social features that enhance community without touching playback control.

**Data model status:**  
- Friend activity items: core models in `src/models/social-feed.js`

---

## Phase 4 — Enhanced Mode (Private / Dev‑Only)
- Queue viewer  
- Playlist browser  
- Playlist editing  
- Search  
- Device switching  

**Goal:** Provide optional advanced features for internal testing only. Not part of public release.

---

## Phase 5 — Production‑Safe Spotify Integration
- No playback control beyond OS‑level  
- No queue/playlist modification in public mode  
- No UI resembling Spotify  
- Clear privacy policy  
- Clear “companion app” positioning

**Goal:** Maintain long‑term eligibility for Spotify production approval.

---

## Phase 6 — Expansion
- Multi‑service identity profiles  
- Cross‑platform sync  
- Mobile companion app  
- Theme marketplace  
- Creator tools for custom visualizers

**Goal:** Grow the ecosystem and deepen user expression.

---

## Guiding Principles
- Companion, not competitor  
- Visual + social first  
- Read‑only by default  
- Cross‑service, not Spotify‑exclusive  
- Respect platform boundaries  

