const THREE = require('three');
const fs    = require('fs');
const path  = require('path');

function initVisualizer(scene, audio, cfg) {
  if (cfg.mode === 'bars')     return barVisualizer(scene, cfg);
  if (cfg.mode === 'shader')   return shaderVisualizer(scene, cfg);
  if (cfg.mode === 'waveform') return waveformVisualizer(scene, audio, cfg);
  return () => {};
}

// ─── Bars (InstancedMesh — one draw call for all bars) ──────────────────────

function barVisualizer(scene, cfg) {
  const n   = cfg.barCount;
  const geo = new THREE.PlaneGeometry(1, 1);
  const baseMat = new THREE.MeshBasicMaterial({ vertexColors: true });
  const sheenMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.84 });
  const mesh = new THREE.InstancedMesh(geo, baseMat, n);
  const sheenMesh = new THREE.InstancedMesh(geo, sheenMat, n);
  scene.add(mesh);
  scene.add(sheenMesh);

  const dummy = new THREE.Object3D();
  const sheenDummy = new THREE.Object3D();
  const col   = new THREE.Color();
  const sheenCol = new THREE.Color();
  const left  = -0.92;
  const right = 0.2;
  const baseY = -0.82;
  const maxH  = 0.98;
  const span  = right - left;
  const w     = span / n;
  const gap   = w * 0.16;
  const levels = new Float32Array(n);
  const prevRaw = new Float32Array(n);
  const barProfile = new Float32Array(n);
  const attack = 0.86;
  const release = 0.34;

  for (let i = 0; i < n; i++) {
    const wave = (Math.sin(i * 1.7) + 1) * 0.5;
    const alt = (i % 2 === 0) ? 0.96 : 1.04;
    barProfile[i] = (0.88 + wave * 0.24) * alt;
  }

  return function update(freqData) {
    let globalSum = 0;
    for (let i = 0; i < freqData.length; i++) globalSum += freqData[i];
    const globalNorm = (globalSum / freqData.length) / 255;
    const maxBin = Math.max(1, freqData.length - 1);
    const supportStart = Math.floor(maxBin * 0.06);
    const supportEnd = Math.max(supportStart + 1, Math.floor(maxBin * 0.34));
    let supportSum = 0;
    for (let j = supportStart; j <= supportEnd; j++) supportSum += freqData[j] / 255;
    const supportAvg = supportSum / (supportEnd - supportStart + 1);

    for (let i = 0; i < n; i++) {
      const t = i / Math.max(1, n - 1);
      const centerFrac = 0.04 + t * 0.92;
      const center = Math.floor(centerFrac * maxBin);
      const halfWidth = Math.max(4, Math.floor((0.15 - t * 0.04) * maxBin));
      const start = Math.max(1, center - halfWidth);
      const end = Math.min(maxBin, center + halfWidth);

      let bandSum = 0;
      let lowPartSum = 0;
      let highPartSum = 0;
      let lowCount = 0;
      let highCount = 0;
      for (let j = start; j <= end; j++) {
        const v = freqData[j] / 255;
        bandSum += v;
        if (j <= center) {
          lowPartSum += v;
          lowCount += 1;
        } else {
          highPartSum += v;
          highCount += 1;
        }
      }
      const bandAvg = bandSum / (end - start + 1);
      const lowAvg = lowCount > 0 ? (lowPartSum / lowCount) : bandAvg;
      const highAvg = highCount > 0 ? (highPartSum / highCount) : bandAvg;
      const localContrast = Math.abs(highAvg - lowAvg);

      const spectralEq = 0.82 + t * 1.8;
      const leftPenalty = 1 - Math.pow(1 - t, 1.8) * 0.52;
      const shared = supportAvg * (0.07 + t * 0.08);
      const base = Math.min(1, (bandAvg + shared) * cfg.sensitivity * spectralEq * leftPenalty * barProfile[i]);
      const compressed = Math.pow(base, 0.5);
      const transient = Math.min(0.4, Math.max(0, compressed - prevRaw[i]) * 2.05);
      prevRaw[i] = compressed;
      const floor = globalNorm * (0.1 + t * 0.16);
      const contrastBoost = Math.min(0.16, localContrast * 0.75);
      const target = Math.max(compressed + transient + contrastBoost, floor);
      const rate = target > levels[i] ? attack : release;
      levels[i] += (target - levels[i]) * rate;

      const minH = 0.012 + t * 0.012;
      const h = Math.max(minH, levels[i] * maxH);
      const barW = w - gap;

      dummy.position.set(left + i * w + w / 2, baseY + h / 2, 0);
      dummy.scale.set(barW, h, 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);

      const sheenH = Math.max(0.012, h * 0.86);
      sheenDummy.position.set(left + i * w + w / 2, baseY + sheenH / 2 + h * 0.04, 0.0002);
      sheenDummy.scale.set(barW * 0.34, sheenH, 1);
      sheenDummy.updateMatrix();
      sheenMesh.setMatrixAt(i, sheenDummy.matrix);

      const shade = 0.16 + levels[i] * 0.24;
      col.setRGB(shade * 0.86, shade * 0.9, shade);
      const sheenShade = Math.min(0.72, 0.42 + levels[i] * 0.36);
      sheenCol.setRGB(sheenShade * 0.76, sheenShade * 0.8, sheenShade * 0.88);
      mesh.setColorAt(i, col);
      sheenMesh.setColorAt(i, sheenCol);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor.needsUpdate = true;
    sheenMesh.instanceMatrix.needsUpdate = true;
    sheenMesh.instanceColor.needsUpdate = true;
  };
}

// ─── Shader (fullscreen GLSL quad fed a DataTexture of FFT data) ────────────

function shaderVisualizer(scene, cfg) {
  const W       = 512;
  const fftData = new Uint8Array(W);
  const fftTex  = new THREE.DataTexture(fftData, W, 1, THREE.RedFormat, THREE.UnsignedByteType);

  const vertSrc = fs.readFileSync(path.join(__dirname, 'shaders', 'vertex.glsl'),   'utf8');
  const fragSrc = fs.readFileSync(path.join(__dirname, 'shaders', 'fragment.glsl'), 'utf8');

  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uFFT:         { value: fftTex },
      uTime:        { value: 0.0 },
      uPrimary:     { value: new THREE.Vector3(...cfg.colors.primary) },
      uSecondary:   { value: new THREE.Vector3(...cfg.colors.secondary) },
      uSensitivity: { value: cfg.sensitivity }
    },
    vertexShader:   vertSrc,
    fragmentShader: fragSrc,
    transparent:    true,
    depthWrite:     false,
    blending:       THREE.AdditiveBlending
  });

  scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat));

  let t = 0;
  return function update(freqData) {
    t += 0.016;
    mat.uniforms.uTime.value = t;
    fftData.set(freqData.subarray(0, W));
    fftTex.needsUpdate = true;
  };
}

// ─── Waveform (BufferGeometry line updated with time-domain data) ────────────

function waveformVisualizer(scene, audio, cfg) {
  const n         = audio.binCount;
  const positions = new Float32Array(n * 3);
  const geo       = new THREE.BufferGeometry();
  const posAttr   = new THREE.BufferAttribute(positions, 3);
  geo.setAttribute('position', posAttr);

  const mat = new THREE.LineBasicMaterial({
    color: new THREE.Color(...cfg.colors.primary),
    transparent: true,
    opacity: 0.85
  });
  scene.add(new THREE.Line(geo, mat));

  return function update(_, timeData) {
    for (let i = 0; i < n; i++) {
      positions[i * 3]     = (i / (n - 1)) * 2 - 1;
      positions[i * 3 + 1] = ((timeData[i] / 128) - 1) * cfg.sensitivity * 0.5;
      positions[i * 3 + 2] = 0;
    }
    posAttr.needsUpdate = true;
  };
}

module.exports = { initVisualizer };
