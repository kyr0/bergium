/**
 * Geiss visual effects — faithful ports of vendor/geiss/main.cpp RenderFX().
 *
 * Each effect paints additive content into a Uint8Array (W*H bytes, one per texel)
 * that gets max-blended into the feedback buffer as a preWarp contribution.
 *
 * Ported from vendor/geiss/main.cpp:
 *   - ShadeBobs/SPECTRAL (lines 8431–8620): frequency-driven blob nodes
 *   - Two_Chasers (line 5490): two chasing points
 *   - Grid (line 5521): grid pattern
 */

/** Pre-computed sqrt lookup table for circular falloff (vendor: sqrt_tab[21][21]). */
const SQRT_TAB: Float32Array = (() => {
  const tab = new Float32Array(21 * 21);
  for (let y = 0; y <= 20; y++) {
    for (let x = 0; x <= 20; x++) {
      tab[y * 21 + x] = Math.sqrt(x * x + y * y);
    }
  }
  return tab;
})();

/** Number of frequency-driven blob nodes (vendor: NUM_FREQS). */
const NUM_FREQS = 16;

/**
 * ShadeBobs / SPECTRAL effect — paints NUM_FREQS circular blobs at positions
 * driven by accumulated phase, with radius ∝ frequency amplitude.
 *
 * Faithful port of vendor/geiss/main.cpp lines 8498–8620.
 */
export function shadeBobs(
  contrib: Uint8Array,
  W: number,
  H: number,
  freqData: Uint8Array,
  frame: number,
  centerX: number,
  centerY: number,
): void {
  const s = W / 640.0;
  const yCutHide = 4;
  const brightness = 200;

  for (let n = 0; n < NUM_FREQS; n++) {
    // Position from accumulated phase (vendor: g_phase_inc[n])
    const phase = frame * 0.5;
    const cx = Math.trunc(
      centerX + s * (64 * Math.cos(phase * 0.00451 + n * 99 + 3) +
                     51 * Math.cos(phase * 0.00572 + n * 13 + 7)),
    );
    const cy = Math.trunc(
      centerY + s * (51 * Math.cos(phase * 0.00502 + n * 78 + 8) +
                     45 * Math.cos(phase * 0.00653 + n * 17 + 5)),
    );

    // Radius from frequency amplitude (vendor: r = z[n]*0.06 - 2)
    const freqIdx = Math.min(freqData.length - 1, Math.floor((n / NUM_FREQS) * freqData.length));
    const amp = freqData[freqIdx] ?? 0;
    let r = amp * 0.06 - 2;
    r = Math.max(0, Math.min(10, r));

    // Draw 21×21 filled circle (vendor lines 8530–8545)
    for (let dy = -10; dy <= 10; dy++) {
      const py = cy + dy;
      if (py < yCutHide || py >= H - yCutHide) continue;
      for (let dx = -10; dx <= 10; dx++) {
        const px = cx + dx;
        if (px < 0 || px >= W) continue;
        const dist = SQRT_TAB[(dy + 10) * 21 + (dx + 10)]!;
        const val = Math.trunc((r - dist) * 25);
        if (val > 0) {
          const offset = py * W + px;
          const blended = Math.min(255, val);
          if (contrib[offset]! < blended) {
            contrib[offset] = Math.min(brightness, blended);
          }
        }
      }
    }
  }
}

/**
 * Two_Chasers effect — two points orbiting around the center,
 * brightness modulated by overall volume.
 */
export function twoChasers(
  contrib: Uint8Array,
  W: number,
  H: number,
  frame: number,
  centerX: number,
  centerY: number,
): void {
  const s = W / 640.0;
  const radius = 80 * s;
  const brightness = 180;
  const yCutHide = 4;

  for (let i = 0; i < 2; i++) {
    const angle = frame * 0.03 + i * Math.PI;
    const cx = Math.trunc(centerX + radius * Math.cos(angle));
    const cy = Math.trunc(centerY + radius * Math.sin(angle));

    // Draw a small filled circle (radius 5)
    for (let dy = -5; dy <= 5; dy++) {
      const py = cy + dy;
      if (py < yCutHide || py >= H - yCutHide) continue;
      for (let dx = -5; dx <= 5; dx++) {
        const px = cx + dx;
        if (px < 0 || px >= W) continue;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist <= 5) {
          const offset = py * W + px;
          const val = Math.trunc(brightness * (1 - dist / 5));
          if (contrib[offset]! < val) contrib[offset] = val;
        }
      }
    }
  }
}

/**
 * Grid effect — paints a grid of dots that pulse with the frame counter.
 */
export function gridEffect(
  contrib: Uint8Array,
  W: number,
  H: number,
  frame: number,
): void {
  const spacing = Math.max(20, Math.trunc(W / 32));
  const yCutHide = 4;
  const pulse = 0.5 + 0.5 * Math.sin(frame * 0.05);

  for (let y = yCutHide; y < H - yCutHide; y += spacing) {
    for (let x = 0; x < W; x += spacing) {
      const brightness = Math.trunc(120 * pulse);
      const offset = y * W + x;
      if (contrib[offset]! < brightness) contrib[offset] = brightness;
    }
  }
}
