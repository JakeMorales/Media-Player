'use strict';

// src/app.js — Renderer bootstrap
// Wires together UI, audio/visualizer, metadata polling, ambient behaviour,
// and identity panel. Runs in the renderer; all main-process work lives in
// main.js.

const { ipcRenderer }       = require('electron');
const cfg                   = require('./config');
const ui                    = require('./ui');
const audio                 = require('./audio');
const { initRenderer }      = require('./renderer');
const { initVisualizer }    = require('./visualizer');
const ambientController     = require('./ambient-controller');
const spectrumCanvas        = require('./spectrum-canvas');
const player                = require('./player');
const transport             = require('./transport');
const volumeControl         = require('./volume-control');
const labelTheme            = require('./label-theme');
const artTransition         = require('./art-transition');
const visualizerController  = require('./visualizer-controller');

(async function bootstrap() {
  // --- UI shell ---------------------------------------------------------

  ui.initUI();

  // Label theming + record art transitions
  labelTheme.init(ui.rootStyle);
  artTransition.init({
    recordArtEl:    ui.el.recordArtEl,
    recordArtNewEl: ui.el.recordArtNewEl,
    sleeveArtEl:    ui.el.sleeveArtEl,
    sleeveArtNewEl: ui.el.sleeveArtNewEl,
    miniArtEl:      ui.el.miniArtEl
  }, () => player.playbackProgressState.trackKey);

  // Spectrum canvases (glass ring + mini strip)
  spectrumCanvas.init({
    glassSpectrumEl: ui.el.glassSpectrumEl,
    miniSpectrumEl:  ui.el.miniSpectrumEl,
    miniArtEl:       ui.el.miniArtEl,
    recordEl:        ui.el.recordEl
  }, ui.getCurrentView);

  // Ambient behaviour — idle full → lid
  ambientController.init({ idleToLidMs: 60000 });

  // Transport wiring (prev / play-pause / next across views)
  transport.init({
    ipcRenderer,
    elements: ui.el,
    onMiniCollapseViewChange: () => {
      // Collapse mini view back to lid view
      const current = ui.getCurrentView();
      if (current === 'mini' || current === 'mini-lid') {
        ui.setCurrentView('lid');
        ui.applyWidgetSize();
        spectrumCanvas.updateGlassSpectrumGeometry(true);
      }
    }
  });

  // Volume knob + glass slider
  volumeControl.init({
    ipcRenderer,
    rootStyle: ui.rootStyle,
    elements: {
      sourceKnobEl:       ui.el.sourceKnobEl,
      sourceVolumeGlassEl: ui.el.sourceVolumeGlassEl,
      volumeBtnGlassEl:   ui.el.volumeBtnGlassEl,
      volumeValueGlassEl: ui.el.volumeValueGlassEl
    },
    onInteraction: (interactive) => ui.setWidgetInteractive(interactive),
    onRelease: () => ui.setWidgetInteractive(ui.isHovering())
  });
  volumeControl.loadSystemVolume();

  // Player metadata model
  player.init({
    artistEl:         ui.el.artistEl,
    albumEl:          ui.el.albumEl,
    albumTextEl:      ui.el.albumTextEl,
    titleEl:          ui.el.titleEl,
    glassTitleEl:     ui.el.glassTitleEl,
    glassArtistEl:    ui.el.glassArtistEl,
    glassAlbumEl:     ui.el.glassAlbumEl,
    miniTitleEl:      ui.el.miniTitleEl,
    miniArtistEl:     ui.el.miniArtistEl,
    miniProgressFillEl: ui.el.miniProgressFillEl,
    labelTitleEl:     ui.el.labelTitleEl,
    labelArtistEl:    ui.el.labelArtistEl
  }, {
    onAlbumMarquee: ui.updateAlbumMarqueeState,
    uiThemeGetter:  () => ui.getUiState().theme
  });

  // --- Three.js renderer + visualizer ----------------------------------

  // Initialise visualizer controller with base config (mode, colours, etc.)
  visualizerController.init(cfg);

  const { renderer, scene, camera, resize } = initRenderer();

  window.addEventListener('resize', () => {
    ui.applyWidgetSize();
    resize();
    spectrumCanvas.updateGlassSpectrumGeometry(true);
  });

  let audioNode = null;
  let vizUpdate = null;
  let audioActivityState = { hotFrames: 0, coldFrames: 0, active: false };
  let arcState = { bass: 0, pulse: 0 };

  try {
    // Web Audio FFT capture
    audioNode = await audio.initAudio(cfg);
    ipcRenderer.send('audio-started');

    // Visualizer config comes from visualizer-controller (mode, colours, etc.)
    const vizCfg = visualizerController.getConfig();
    vizUpdate = initVisualizer(scene, audioNode, vizCfg);
  } catch (err) {
    console.warn('Audio / visualizer initialisation failed:', err);
  }

  // --- Metadata polling -------------------------------------------------

  async function pollMeta() {
    try {
      const meta = await ipcRenderer.invoke('media-meta:get');
      if (meta) {
        // player.setMetadata already feeds sessionTracker internally (Phase 2 hook)
        player.setMetadata(meta);

        // Keep the shelf session row live whenever new metadata arrives
        if (typeof ui.refreshShelf === 'function') ui.refreshShelf();
      }
    } catch (_) {
      // Metadata is best-effort; ignore errors.
    }
  }

  pollMeta();
  setInterval(pollMeta, cfg.metadata.pollMs);

  // --- RAF loop ---------------------------------------------------------

  const emptyFreq = new Uint8Array(256);

  function frame(now) {
    const hasAudio = !!(audioNode && vizUpdate);
    const freqData = hasAudio ? audioNode.getFreq() : emptyFreq;
    const timeData = hasAudio ? audioNode.getTime() : emptyFreq;

    // Audio activity → status bar + power light
    const activity = player.detectAudioActive(freqData, audioActivityState, cfg);
    // Treat OS playback state as a floor: if the OS reports "playing",
    // keep the deck in ACTIVE state even if loopback audio capture is
    // unavailable or too quiet to trip the FFT threshold.
    const playing = player.currentMeta.playbackStatus === 'playing';
    const effectiveActive = activity.active || playing;
    ui.setStatus(effectiveActive, activity.level);

    // Record arc / tonearm motion
    if (hasAudio) {
      player.updateArcMotion(freqData, arcState, activity.active, activity.level);
    }

    // Visualizer & Three renderer
    if (hasAudio) {
      vizUpdate(freqData, timeData);
      renderer.render(scene, camera);
    }

    // Ambient view controller (full → lid)
    const nextView = ambientController.nextView({
      now,
      active: activity.active,
      level: activity.level,
      playing: player.currentMeta.playbackStatus === 'playing',
      currentView: ui.getCurrentView(),
      hovering: ui.isHovering()
    });
    if (nextView && nextView !== ui.getCurrentView()) {
      ui.setCurrentView(nextView);
      ui.applyWidgetSize();
      spectrumCanvas.updateGlassSpectrumGeometry(true);
    }

    // Playback progress bar + tonearm
    player.updatePlaybackProgress(now);

    // Canvas spectra
    spectrumCanvas.renderGlassSpectrum(freqData, activity.active, activity.level);
    spectrumCanvas.renderMiniSpectrum(freqData, activity.active);

    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
})();
