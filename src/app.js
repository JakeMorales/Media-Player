'use strict';

// app.js - Orchestrator: wires modules, metadata bridge, render loop

const cfg            = require('./config');
const { initAudio }  = require('./audio');
const { initRenderer }   = require('./renderer');
const { initVisualizer } = require('./visualizer');
const { ipcRenderer }    = require('electron');

const labelTheme     = require('./label-theme');
const artTransition  = require('./art-transition');
const spectrumCanvas = require('./spectrum-canvas');
const volumeControl  = require('./volume-control');
const transport      = require('./transport');
const player         = require('./player');
const ui             = require('./ui');

// --- Init UI ---

ui.initUI();

// --- Init label theme ---

labelTheme.init(ui.rootStyle);

// --- Init art transition ---

artTransition.init(
  { recordArtEl: ui.el.recordArtEl, recordArtNewEl: ui.el.recordArtNewEl,
    sleeveArtEl: ui.el.sleeveArtEl, sleeveArtNewEl: ui.el.sleeveArtNewEl,
    miniArtEl: ui.el.miniArtEl },
  () => player.playbackProgressState.trackKey
);

// --- Init spectrum canvas ---

spectrumCanvas.init(
  { glassSpectrumEl: ui.el.glassSpectrumEl, miniSpectrumEl: ui.el.miniSpectrumEl,
    miniArtEl: ui.el.miniArtEl, recordEl: ui.el.recordEl },
  () => ui.getCurrentView()
);

// --- Init player (inject DOM refs + callbacks) ---

player.init(
  { artistEl: ui.el.artistEl, albumEl: ui.el.albumEl, albumTextEl: ui.el.albumTextEl,
    titleEl: ui.el.titleEl, glassTitleEl: ui.el.glassTitleEl, glassArtistEl: ui.el.glassArtistEl,
    glassAlbumEl: ui.el.glassAlbumEl, miniTitleEl: ui.el.miniTitleEl, miniArtistEl: ui.el.miniArtistEl,
    miniProgressFillEl: ui.el.miniProgressFillEl,
    labelTitleEl: ui.el.labelTitleEl, labelArtistEl: ui.el.labelArtistEl },
  { onAlbumMarquee: ui.updateAlbumMarqueeState,
    uiThemeGetter: () => ui.getUiState().theme }
);

// --- Init frame height ---

if (ui.el.frameEl) ui.el.frameEl.style.height = `${cfg.widget.barsHeight}px`;

// --- Init transport ---

transport.init({
  ipcRenderer,
  elements: {
    btnPrevEl: ui.el.btnPrevEl, btnPlayPauseEl: ui.el.btnPlayPauseEl, btnNextEl: ui.el.btnNextEl,
    btnPrevGlassEl: ui.el.btnPrevGlassEl, btnPlayPauseGlassEl: ui.el.btnPlayPauseGlassEl, btnNextGlassEl: ui.el.btnNextGlassEl,
    btnPrevMiniEl: ui.el.btnPrevMiniEl, btnPlayPauseMiniEl: ui.el.btnPlayPauseMiniEl, btnNextMiniEl: ui.el.btnNextMiniEl,
    btnMiniCollapseEl: ui.el.btnMiniCollapseEl
  },
  onMiniCollapseViewChange() {
    ui.setSuppressFlag(true);
    ui.setCurrentView('lid');
    ui.applyWidgetSize();
    spectrumCanvas.updateGlassSpectrumGeometry(true);
  }
});

// --- Init volume control ---

volumeControl.init({
  ipcRenderer,
  rootStyle: ui.rootStyle,
  elements: {
    sourceKnobEl: ui.el.sourceKnobEl, sourceVolumeGlassEl: ui.el.sourceVolumeGlassEl,
    volumeBtnGlassEl: ui.el.volumeBtnGlassEl, volumeValueGlassEl: ui.el.volumeValueGlassEl
  },
  onInteraction: ui.setWidgetInteractive,
  onRelease: () => ui.setWidgetInteractive(ui.isMouseOverWidget(ui.getLastMouse().x, ui.getLastMouse().y))
});
volumeControl.loadSystemVolume();

// --- Metadata bridge ---

async function startMetadataBridge() {
  player.setMetadata({ artist: 'Waiting for media', album: '', title: 'Desktop audio session', artwork: '' });
  try {
    const initial = await ipcRenderer.invoke('media-meta:get');
    if (initial) {
      player.setMetadata({
        appId: initial.appId || '', artist: initial.artist || 'Unknown Artist',
        album: initial.album || '', title: initial.title || 'Unknown Track',
        artwork: initial.artwork || '', playbackStatus: initial.playbackStatus || 'paused',
        durationMs: initial.durationMs, positionMs: initial.positionMs,
        controls: initial.controls || {}
      });
    }
  } catch {}

  ipcRenderer.on('media-meta', (_, meta) => {
    if (!meta) {
      player.setMetadata({ artist: 'Waiting for media', album: '', title: 'Desktop audio session', artwork: '' });
      return;
    }
    player.setMetadata({
      appId: meta.appId || '', artist: meta.artist || 'Unknown Artist',
      album: meta.album || '', title: meta.title || 'Unknown Track',
      artwork: meta.artwork || '', playbackStatus: meta.playbackStatus || 'paused',
      durationMs: meta.durationMs, positionMs: meta.positionMs,
      controls: meta.controls || {}
    });
  });
}

// --- Start ---

async function start() {
  try {
    await startMetadataBridge();
    const audio = await initAudio(cfg);
    const { renderer, scene, camera, resize } = initRenderer();
    const update = initVisualizer(scene, audio, cfg);
    const detector = { active: false, hotFrames: 0, coldFrames: 0 };
    const arcMotion = { bass: 0, pulse: 0 };

    window.addEventListener('resize', () => {
      ui.applyWidgetSize();
      ui.updateAlbumMarqueeState();
      spectrumCanvas.updateGlassSpectrumGeometry(true);
      resize();
    });

    ipcRenderer.send('audio-started');

    function loop() {
      requestAnimationFrame(loop);
      const freq = audio.getFreq();
      const time = audio.getTime();
      const now = performance.now();
      const { active, level } = player.detectAudioActive(freq, detector, cfg);
      ui.setStatus(active, level);
      ui.updatePowerLight(active, player.playbackProgressState.playing);
      player.updateArcMotion(freq, arcMotion, active, level);
      spectrumCanvas.renderGlassSpectrum(freq, active, level);
      spectrumCanvas.renderMiniSpectrum(freq, active);
      player.updatePlaybackProgress(now);
      update(freq, time);
      renderer.render(scene, camera);
    }
    loop();
  } catch (err) {
    console.error(err);
    document.body.insertAdjacentHTML('beforeend',
      `<div style="position:fixed;bottom:20px;left:20px;color:#ff4444;
        font-family:monospace;font-size:12px;background:rgba(0,0,0,0.7);
        padding:10px;border:1px solid #ff4444;">Error: ${err.message}</div>`
    );
  }
}

start();
