import type { RandomSource } from "./MapField.js";

export type RGB = { r: number; g: number; b: number };
export interface PaletteDescriptor { fxPalette: number | null; curves: [number, number, number] | null; lowBand: number; highBand: number; }

export function crankPalette(curve: number, z: number): number {
  switch (curve) { case 1: return Math.sqrt(z) * 22.6; case 2: return z * 2; case 3: return z * z / 64; case 4: return 255 * Math.sin(z / 256 * .5 * Math.PI); case 5: return z * 3.5; case 6: return 1.5 ** (z / 20) - 1; case 7: return z * 1.5 + 64 + 64 * Math.sin(z * .3); default: return 255; }
}

export function createPalette(rng: RandomSource, gammaSetting = 10, soundEmpty = false, solarFrequency = 1, coarseFrequency = 1): { descriptor: PaletteDescriptor; colors: RGB[] } {
  let low = -1, high = -1; if (rng.nextInt(10) < coarseFrequency) { low = 7 + rng.nextInt(6); high = 17 + rng.nextInt(6); }
  if (rng.nextInt(6) === 0) {
    const fx = rng.nextInt(4), colors: RGB[] = [];
    for (let n = 0; n < 256; n++) { const a = Math.min(127, n), q = a * a / 64, l = a * 2, s = Math.sqrt(a) * 22.6; const v = fx === 0 ? [q, s, l] : fx === 1 ? [q, l, s] : fx === 2 ? [s, q, l] : [l, q, s]; colors.push({ r: v[0]!, b: v[1]!, g: v[2]! }); }
    return { descriptor: { fxPalette: fx, curves: null, lowBand: low, highBand: high }, colors };
  }
  let curves: [number, number, number];
  do { const max = rng.nextInt(5) < solarFrequency ? 7 : 6; curves = [1 + rng.nextInt(max), 1 + rng.nextInt(max), 1 + rng.nextInt(max)]; } while (curves.filter(x => x === 6).length > 1);
  const gamma = 1 + gammaSetting * .01 + (soundEmpty ? .3 : 0), colors: RGB[] = [];
  for (let n = 0; n < 256; n++) { let r = crankPalette(curves[0], n) * gamma, b = crankPalette(curves[1], n) * gamma, g = crankPalette(curves[2], n) * gamma; if (n > low && n < high) { r *= 2; g *= 2; b *= 2; } colors.push({ r: Math.min(255, r) | 0, g: Math.min(255, g) | 0, b: Math.min(255, b) | 0 }); }
  return { descriptor: { fxPalette: null, curves, lowBand: low, highBand: high }, colors };
}

export function blendPalette(oldColors: readonly RGB[], next: readonly RGB[], blendsLeft: number): RGB[] {
  const a = blendsLeft / 18, b = 1 - a; return next.map((v, i) => ({ r: (oldColors[i]!.r * a + v.r * b) | 0, g: (oldColors[i]!.g * a + v.g * b) | 0, b: (oldColors[i]!.b * a + v.b * b) | 0 }));
}

