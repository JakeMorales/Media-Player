uniform sampler2D uFFT;
uniform float     uTime;
uniform vec3      uPrimary;
uniform vec3      uSecondary;
uniform float     uSensitivity;

varying vec2 vUv;

void main() {
  // Frequency amplitude for this horizontal position
  float amp  = texture2D(uFFT, vec2(vUv.x, 0.0)).r * uSensitivity;

  // Bar fill below the amplitude line
  float fill = step(vUv.y, amp);

  // Glow that bleeds above and below the bar top
  float glowD = abs(vUv.y - amp);
  float glow  = exp(-glowD * 25.0) * amp * 1.5;

  // Bass-reactive background pulse driven by the lowest bins
  float bass  = texture2D(uFFT, vec2(0.04, 0.0)).r;
  float pulse = bass * 0.06 * (sin(uTime * 2.0 + vUv.x * 6.28318) * 0.5 + 0.5);

  // Color gradient primary→secondary across the spectrum with subtle time drift
  vec3 grad = mix(uPrimary, uSecondary, vUv.x + sin(uTime * 0.3) * 0.05);

  vec3 col = mix(grad * 0.6, grad, fill);           // dimmer fill base
  col += glow  * mix(uPrimary, uSecondary, vUv.x);  // bright glow at bar tip
  col += mix(uPrimary, uSecondary, 0.5) * pulse;    // bass background shimmer

  float alpha = fill * 0.70 + glow * 0.55 + pulse * 0.25;
  gl_FragColor = vec4(col, clamp(alpha, 0.0, 1.0));
}
