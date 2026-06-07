# Desktop Media Player Widget

A lightweight Electron-based desktop overlay combining a real-time audio visualizer with a full vinyl deck media player. Reads live OS media metadata (track, artist, album art) via the Windows Media Session API and renders a spinning record, animated album art, transport controls, and an audio spectrum — all in a frameless transparent window.

## Stack

| Layer | Tech |
|-------|------|
| Desktop window | Electron 30 (frameless, transparent, `nodeIntegration: true`) |
| OS media metadata | `windows-media-sessions` (Windows Runtime / WinRT) |
| Visualizer rendering | Three.js + WebGL (bars / waveform / shader modes) |
| Audio analysis | Web Audio API (`AnalyserNode`, FFT, loopback capture) |
| UI & animations | DOM + CSS (custom properties, transitions, `@keyframes`) |
| Art transitions | CSS Houdini `@property` + `mask-image` / `mask-composite` |
| Shaders | GLSL (fragment shader visualizer mode) |
| Volume control | PowerShell inline + Windows Core Audio COM (`IAudioEndpointVolume`) |

---

## Project Structure

```
.
├── main.js                  Electron main process — window, tray, IPC, media sessions, volume
├── package.json
└── src/
    ├── index.html               Renderer entry point + all widget HTML
    ├── app.js                   Renderer orchestrator (modules, IPC bridge, RAF loop)
    ├── config.js                User-tunable defaults (FFT, colours, widget sizing)
    ├── audio.js                 Web Audio API module (FFT analyser, loopback capture)
    ├── renderer.js              Three.js WebGL renderer setup
    ├── visualizer.js            Three.js visualizer modes (bars / waveform / shader)
    ├── visualizer-controller.js Visualizer mode + config controller
    ├── ambient-controller.js    Ambient / overlay behaviour policy
    ├── player.js                Metadata model, playback progress, source inference
    ├── transport.js             Media transport controls wiring (prev / play-pause / next)
    ├── volume-control.js        System volume knob + glass slider + mute
    ├── ui.js                    Widget layout, views (full / lid / mini / mini-lid), drag/resize, settings
    ├── art-transition.js        Record burn / sleeve cross-dissolve / mini art fade
        ├── label-theme.js           Album-art-driven record label theming
    ├── spectrum-canvas.js       Glass + mini canvas spectrum renderers
    ├── models/
    │   ├── listening-stats.js   Data models for listening stats (Phase 2)
    │   ├── vibes.js             Data models for vibe badges & summaries (Phase 2)
    │   └── social-feed.js       Data models for friend activity items (Phase 3)
    ├── stats/
    │   ├── session-tracker.js   Passive session capture from OS metadata → ListeningSample[]
    │   ├── aggregator.js        Pure helpers to build daily ListeningStatsSnapshot[]
    │   └── runtime-store.js     In-memory cache for daily stats (future UI entrypoint)

        ├── spectrum-canvas.js       Glass + mini canvas spectrum renderers
    ├── identity-panel.js        Phase 2 identity stats (today + streak UI; currently disabled)

    ├── main/

    │   ├── media-control-ps.js  PowerShell helpers for media transport
    │   └── volume-ps.js         PowerShell helpers for system volume
    ├── shaders/
    │   ├── vertex.glsl          Passthrough vertex shader
    │   └── fragment.glsl        Audio-reactive fragment shader
    └── styles/
        ├── base.css             CSS reset and root custom properties / design tokens
        ├── widget.css           Widget frame and surface
        ├── layout.css           Deck grid, left/right pane, view transitions
        ├── controls.css         Transport buttons, settings panel, source knob
        ├── sleeve.css           Album art sleeve and cross-dissolve transition
        ├── glass.css            Glass overlay panel (lid view)
        ├── record.css           Vinyl record disc, grooves, label, tonearm, burn-mask animation
        ├── mini.css             Mini mode compact pane
        ├── ui.css               Misc overlay elements
        ├── animations.css       All @keyframes + CSS Houdini @property vars
        └── responsive.css       Scale and resize behaviour
```


---

## Setup

```bash
npm install
npm start        # production
npm run dev      # dev mode: opens DevTools, restarts on main.js changes, hot-reloads src/ changes
```

---

## Configuration — `src/config.js`

| Key | Default | Description |
|-----|---------|-------------|
| `mode` | `'bars'` | Visualizer render mode: `'bars'` · `'waveform'` · `'shader'` |
| `fftSize` | `2048` | FFT window size (power of 2, 32–32768) |
| `smoothing` | `0.28` | Analyser smoothing constant (0 = instant, 1 = frozen) |
| `sensitivity` | `3.2` | Amplitude multiplier |
| `barCount` | `14` | Number of frequency bars (bars mode only) |
| `widget.width` | `600` | Widget width in pixels |
| `widget.barsHeight` | `62` | Bars viewport height in pixels |
| `metadata.pollMs` | `1200` | How often main polls the Windows Media Session (ms) |
| `activity.threshold` | `0.035` | Normalised FFT level considered active |
| `activity.sampleBins` | `192` | FFT bins sampled for activity detection |
| `activity.attackFrames` | `6` | Frames above threshold before entering active state |
| `activity.releaseFrames` | `45` | Frames below threshold before returning to idle |
| `colors.primary` | `[0, 0.8, 1]` | Primary RGB colour 0–1 (default: cyan) |
| `colors.secondary` | `[1, 0.2, 0.8]` | Secondary RGB colour 0–1 (default: magenta) |

---

## Views

The widget has four display modes controlled by `data-view` on `#widget`:

### `full` — Vinyl deck
Left pane: track metadata, transport controls, settings button, WebGL bar visualizer.
Right pane: album art sleeve with animated cross-dissolve on track change.
Center: spinning vinyl record with album art and tonearm that tracks playback position.

### `lid` — Glass overlay
The record "closes" into a slot behind a frosted glass panel showing title, artist, album, a circular spectrum ring, and a volume knob. Transport and quick-menu controls remain accessible.

### `mini` — Compact bar
A slim bar showing album art thumbnail (with spectrum ring overlay), track title, artist, playback progress, and mini transport buttons. Can be toggled from the settings panel or quick menu.

### `mini-lid` — Compact glass overlay
A lid-style overlay variant of mini mode. The mini bar remains primary, with additional metadata and controls revealed on hover.


---

## Album Art Transitions

Track changes trigger two simultaneous animations, both gated behind `img.decode()` to prevent blank-frame flashes:

### Record — paper burn-through (CSS Houdini)
The old art (`#recordArt`) is masked away using `mask-image` with 25 radial-gradient holes across 5 independent CSS `@property` variables (`--brn-a` … `--brn-e`). Each variable is animated by its own `@keyframes` rule with a distinct duration, easing, and optional delay — so the holes appear at staggered rates, starting from two ignition clusters (center-left and upper-right) and spreading outward to small edge smolders. The new art (`#recordArtNew`, positioned beneath) is revealed through the holes.

| Group | Holes | Duration | Easing | Delay | Character |
|-------|-------|----------|--------|-------|-----------|
| A | 5 | 550 ms | ease-out | — | Fast center-left ignition |
| B | 5 | 800 ms | ease-in | — | Upper-right ignition |
| C | 5 | 720 ms | cubic-bezier(0.65,0,0.15,1) | 100 ms | Left/bottom burst |
| D | 5 | 660 ms | ease-in-out | — | Right/bottom spread |
| E | 5 | 880 ms | ease-in | 50 ms | Edge smolders |

### Sleeve — cross-dissolve
`#sleeveArtNew` fades in over `#sleeveArt` (opacity transition, 450 ms). Once the new art is fully opaque, `#sleeveArt` swaps its `src` and `#sleeveArtNew` fades back out.

### Rapid-skip resilience
An 80 ms debounce prevents mid-skip transitions — only the track the user settles on triggers an animation. If artwork hasn't arrived when the debounce fires, a `_pendingArtKey` flag holds the current display until artwork arrives in a subsequent metadata update. The `_artBurnGen` generation counter lets any stale async callbacks self-cancel when superseded.

---

## Media Metadata

Track metadata (title, artist, album, artwork URL, playback state, position, duration, transport capabilities) is read from the **Windows Media Session API** via `windows-media-sessions` in the main process and pushed to the renderer over IPC. Supported sources are detected automatically; known sources (Spotify, Apple Music, YouTube, browser) get labelled accent colours.

The main process polls at `config.metadata.pollMs` and also subscribes to `onSessionsChanged` for instant updates. The renderer interpolates playback position between polls using `requestAnimationFrame` timestamps.

Album art colours are sampled via a hidden `<canvas>` to derive a dynamic label theme (base colour, ring colour, panel tint, ink colour) applied as CSS custom properties on `#recordLabel`.

---

## Audio Input & Visualizer

Desktop loopback audio is captured via Electron's `desktopCapturer` / display capture and fed into a Web Audio `AnalyserNode`. Activity detection (attack/release hysteresis) determines `data-state="active"` vs `"idle"` on the widget.

Three visualizer render modes share the same RAF loop:

| Mode | Implementation |
|------|---------------|
| `bars` | `InstancedMesh` — one GPU draw call regardless of bar count |
| `waveform` | `BufferGeometry` updated per frame |
| `shader` | Fullscreen GLSL quad, FFT fed as a `DataTexture` per frame |

In addition to the WebGL visualizer, two Canvas 2D spectrum rings are rendered each frame: one inside the glass overlay (`#glassSpectrum`) and one overlaid on the mini mode album art thumbnail (`#miniSpectrum`).

---

## Volume Control

System output volume is controlled via an inline PowerShell script that calls Windows Core Audio COM interfaces (`IAudioEndpointVolume`). The volume knob in the glass panel lets the user drag to set level or click the mute button. Changes are debounced and sent to the main process over IPC.

---

## Window Behaviour

| Feature | Detail |
|---------|--------|
| Transparent | `transparent: true` — widget surface uses CSS `backdrop-filter` and semi-transparent backgrounds |
| Click-through | `setIgnoreMouseEvents(true, { forward: true })` when the cursor leaves the widget bounds |
| Frameless | `frame: false` |
| Draggable | Pointer drag on the widget moves the window (`ipcRenderer` → `win.setPosition`) |
| Resizable | Resize handle in the corner; scale slider in settings (0.7×–1.35×) |
| Pin | Pin button locks the widget in place (disables drag) |
| System tray | Right-click tray icon → Show / Hide / Quit |
| Hot-reload | `npm run dev` uses nodemon for `main.js` restarts and in-app `src/` file reload with 150 ms debounce |

> **Desktop layer (always-on-bottom):** Electron has no cross-platform API for placing a window below all others on Windows. Options:
> - Use **Wallpaper Engine** to manage window layering
> - Win + D to show desktop, then click the tray icon to bring the widget back
> - Add a native Win32 `SetWindowPos(HWND_BOTTOM)` call via a native addon (e.g. `koffi`)

---

## Tray Icon

Place a **32×32 PNG** at `assets/icon.png` to replace the invisible fallback icon.

---

## Architecture Notes

- **One RAF loop** drives audio reads, WebGL rendering, Canvas 2D spectrum updates, and ambient view decisions
- **Zero typed-array allocation per frame** — FFT buffers and spectrum level arrays are pre-allocated
- `InstancedMesh` for bars = one GPU draw call regardless of bar count
- FFT data passed to GLSL shader as a `DataTexture` (texture upload, not a uniforms array)
- `smoothingTimeConstant` on the analyser node handles exponential interpolation in the audio thread
- CSS `@property` (Houdini) lets Chromium interpolate custom properties inside `calc()` inside `mask-image` — enabling the per-hole burn animation without any JavaScript per frame
- `img.decode()` is used before any artwork swap to ensure the image is fully paint-ready, preventing 1–2 frame blank flashes that `onload` alone cannot prevent
- All async art-transition callbacks carry a generation token (`_artBurnGen`) and self-cancel if superseded, preventing race conditions during rapid track changes
- `visualizer-controller.js` wraps config and mode selection so visualizer behaviour can be changed without touching renderer code
- `ambient-controller.js` implements a conservative one-way ambient policy: after prolonged idle time, `full` view transitions to `lid` without ever forcing a return


---

## Ideas / Roadmap

- [ ] Particle burst on beat onset (energy-delta detection)
- [ ] Multi-monitor support — detect all displays and span/clone
- [ ] Electron packager (`electron-builder`) for distributable `.exe`
- [ ] Tauri port for smaller binary footprint
- [ ] MIDI or OSC input to override colour/sensitivity in real-time
- [ ] macOS support (replace `windows-media-sessions` with `MediaRemote` private framework or `nowplaying-cli`)
