# Desktop Audio Visualizer

A lightweight, GPU-accelerated desktop overlay that visualizes audio in real-time.
Runs transparent and click-through alongside Wallpaper Engine or any other desktop customization tool.

## Stack

| Layer | Tech |
|-------|------|
| Desktop window | Electron (frameless, transparent) |
| Rendering | Three.js + WebGL |
| Audio analysis | Web Audio API (AnalyserNode, FFT) |
| Shaders | GLSL (fragment shader mode) |

---

## Project Structure

```
.
├── main.js               Electron main process — window, tray, IPC
├── package.json
└── src/
    ├── index.html        Renderer entry point
    ├── app.js            Startup glue — audio + renderer + loop
    ├── config.js         User-tunable settings
    ├── audio.js          Web Audio API module (FFT analyser)
    ├── renderer.js       Three.js WebGL renderer setup
    ├── visualizer.js     Three visualizer modes (bars / waveform / shader)
    └── shaders/
        ├── vertex.glsl   Passthrough vertex shader
        └── fragment.glsl Audio-reactive fragment shader
```

---

## Setup

```bash
npm install
npm start        # production
npm run dev      # dev mode: opens DevTools + hot-reloads on src/ changes
```

---

## Configuration — `src/config.js`

| Key | Default | Description |
|-----|---------|-------------|
| `mode` | `'bars'` | Render mode: `'bars'` · `'waveform'` · `'shader'` |
| `fftSize` | `2048` | FFT window size (power of 2, 32–32768) |
| `smoothing` | `0.8` | Analyser smoothing constant (0 = instant, 1 = frozen) |
| `sensitivity` | `1.5` | Amplitude multiplier |
| `barCount` | `128` | Number of frequency bars (bars mode only) |
| `widget.width` | `430` | Widget width in pixels |
| `widget.barsHeight` | `150` | Bars viewport height in pixels |
| `activity.threshold` | `0.035` | Level above which playback is considered active |
| `activity.sampleBins` | `192` | FFT bins sampled for activity detection |
| `activity.attackFrames` | `6` | Frames required to enter active state |
| `activity.releaseFrames` | `45` | Frames required to return to idle |
| `colors.primary` | `[0, 0.8, 1]` | Primary RGB colour 0–1 (default: cyan) |
| `colors.secondary` | `[1, 0.2, 0.8]` | Secondary RGB colour 0–1 (default: magenta) |

---

## Render Modes

### `bars` (default)
Frequency-domain bars using a single **InstancedMesh** draw call.
Per-instance colours shift from blue → cyan → purple across the spectrum.

### `waveform`
Time-domain oscilloscope line via **BufferGeometry** updated each frame.

### `shader`
Fullscreen GLSL quad fed a **DataTexture** of 512 FFT bins each frame.
Features: bar fill, glow at bar tips, bass-reactive background shimmer, animated colour gradient.

---

## Audio Input

By default the app captures **desktop loopback audio** (Spotify, Apple Music, browser, games, etc.)
through Electron display capture and auto-detects whether playback is active.

On Windows this usually works out of the box. If your device/driver blocks loopback,
the app now reports an error instead of switching to microphone input.

The detector is source-agnostic: it does not identify app names, it measures energy from
the desktop output signal, so any service routed to system output is detected.

## Widget Style

The visualizer now renders inside a bordered compact widget in the **top-right** corner
instead of stretching across the full desktop. The widget includes:
- Album artwork slot
- Artist and track labels
- Live activity status badge
- Framed bars viewport

Metadata is best-effort and read from browser media session metadata when available.
If unavailable, fallback labels are shown while the visualizer still reacts to audio.

---

## Window Behaviour

| Feature | Detail |
|---------|--------|
| Transparent | `transparent: true` + WebGL alpha clear |
| Click-through | `setIgnoreMouseEvents(true, { forward: true })` after audio starts |
| Frameless | `frame: false` |
| System tray | Right-click tray icon → Show / Hide / Quit |
| Hot-reload | `npm run dev` watches `src/` with 150 ms debounce |

> **Desktop layer (always-on-bottom):** Electron has no cross-platform API for placing
> a window below all others on Windows. Options:
> - Use **Wallpaper Engine** to manage window layering
> - Send the window to the back manually (Win + D, then click the tray to show it)
> - Add a native Win32 `SetWindowPos(HWND_BOTTOM)` call via a native addon (e.g. `koffi`)

---

## Tray Icon

Place a **32×32 PNG** at `assets/icon.png` to replace the invisible fallback icon.

---

## Architecture Notes

- **No DOM manipulation** after startup — all visuals are WebGL
- **One RAF loop** drives both audio reads and rendering
- **Zero garbage per frame** — all typed arrays are pre-allocated
- `InstancedMesh` for bars = one GPU draw call regardless of bar count
- FFT data passed to shaders as a `DataTexture` (GPU texture upload, not uniforms array)
- `smoothingTimeConstant` on the analyser node handles interpolation in the audio thread

---

## Ideas / Roadmap

- [ ] Particle system driven by onset detection (beat-reactive burst)
- [ ] IPC config panel (hidden overlay that appears on tray double-click)
- [ ] Multi-monitor support — detect all displays and span/clone
- [ ] Auto-launch at Windows startup via `app.setLoginItemSettings`
- [ ] Electron packager (`electron-builder`) for distributable `.exe`
- [ ] Tauri port for smaller binary footprint
- [ ] MIDI or OSC input to override colour/sensitivity in real-time
