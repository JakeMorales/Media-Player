async function getDesktopAudioStream() {
  return navigator.mediaDevices.getDisplayMedia({
    audio: {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false
    },
    video: {
      width: 1,
      height: 1,
      frameRate: 1
    }
  });
}

async function initAudio(cfg) {
  const ctx = new AudioContext();
  if (ctx.state !== 'running') await ctx.resume();
  const analyser = ctx.createAnalyser();
  analyser.fftSize = cfg.fftSize;
  analyser.smoothingTimeConstant = cfg.smoothing;

  let stream;
  let source = 'desktop';

  try {
    stream = await getDesktopAudioStream();
  } catch {
    throw new Error('Desktop loopback audio capture is unavailable on this device.');
  }

  stream.getVideoTracks().forEach((t) => t.stop());

  const src = ctx.createMediaStreamSource(stream);
  src.connect(analyser);

  const freqBuf = new Uint8Array(analyser.frequencyBinCount);
  const timeBuf = new Uint8Array(analyser.frequencyBinCount);

  return {
    getFreq() { analyser.getByteFrequencyData(freqBuf);   return freqBuf; },
    getTime() { analyser.getByteTimeDomainData(timeBuf);  return timeBuf; },
    binCount: analyser.frequencyBinCount,
    source,
    ctx
  };
}

module.exports = { initAudio };
