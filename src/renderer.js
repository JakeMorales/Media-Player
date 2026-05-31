const THREE = require('three');

function initRenderer() {
  const canvas = document.getElementById('c');

  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: false,
    powerPreference: 'high-performance',
    preserveDrawingBuffer: false
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  const resize = () => {
    const w = Math.max(1, canvas.clientWidth);
    const h = Math.max(1, canvas.clientHeight);
    renderer.setSize(w, h, false);
  };
  resize();
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  // Orthographic camera mapped to clip space (-1..1 on each axis)
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
  camera.position.z = 1;

  return { renderer, scene, camera, resize };
}

module.exports = { initRenderer };
