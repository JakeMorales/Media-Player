module.exports = {
  fftSize: 2048,        // FFT resolution — must be power of 2, 32–32768
  smoothing: 0.28,      // analyser smoothing 0–1  (higher = slower decay)
  sensitivity: 3.2,     // amplitude multiplier
  mode: 'bars',         // 'bars' | 'waveform' | 'shader'
  barCount: 14,         // bars mode only
  widget: {
    width: 600,
    barsHeight: 62
  },
  metadata: {
    pollMs: 1200
  },
  activity: {
    threshold: 0.035,   // average normalized FFT level considered "music playing"
    sampleBins: 192,    // bins used to estimate activity
    attackFrames: 6,    // frames above threshold before active state
    releaseFrames: 45   // frames below threshold before idle state
  },

  colors: {
    primary:   [0.0, 0.8, 1.0],   // RGB 0–1  (cyan)
    secondary: [1.0, 0.2, 0.8]    // RGB 0–1  (magenta)
  }
};
