export const EFFECT = {
  chasers: 0, bar: 1, dots: 2, solar: 3, grid: 4,
  nuclide: 5, shade: 6, spectral: 7,
} as const;

export interface ClassicModeConfig {
  /** Ninth threshold is the source's unnamed effect slot, initialized to 1000/9. */
  readonly threshold: readonly [number, number, number, number, number, number, number, number, number];
  readonly solarMax: number;
  readonly centerDwindle: number;
  readonly minEffects: number;
  readonly maxEffects: number;
}

const c = (
  threshold: ClassicModeConfig["threshold"], solarMax = 60,
  centerDwindle = 1, minEffects = 1, maxEffects = 2,
): ClassicModeConfig => ({ threshold, solarMax, centerDwindle, minEffects, maxEffects });

/** Source mode number is the array index + 1. Do not reorder. */
export const CLASSIC_MODES: readonly ClassicModeConfig[] = [
  c([220, 150, 10, 680, 4, 170, 400, 0, 111], 400, 1),
  c([750, 500, 750, 750, 0, 0, 0, 0, 111], 35, 1, 1, 5),
  c([100, 100, 100, 500, 10, 0, 300, 0, 111], 60, .99),
  c([500, 100, 100, 100, 30, 0, 0, 0, 111], 34, .98),
  c([100, 350, 100, 500, 15, 180, 500, 0, 111], 60, .99),
  c([400, 120, 200, 0, 0, 0, 0, 0, 111]),
  c([50, 200, 0, 300, 0, 600, 350, 0, 111], 65, .985),
  c([150, 150, 150, 150, 25, 0, 0, 0, 111], 60, .96),
  c([450, 200, 50, 200, 0, 100, 200, 0, 111], 50, .985),
  c([150, 20, 80, 0, 0, 80, 0, 0, 111], 0, 1, 0, 2),
  c([360, 200, 230, 550, 10, 330, 150, 0, 111], 750, 1, 0, 4),
  c([360, 200, 230, 0, 0, 330, 0, 0, 111], 500, .915, 0, 2),
  c([500, 0, 100, 0, 30, 0, 0, 0, 111], 34, .98),
  c([500, 0, 100, 0, 30, 0, 0, 0, 111], 34, .98),
  c([0, 0, 0, 0, 0, 200, 0, 0, 111], 60, 1, 0, 1),
  c([500, 100, 100, 100, 30, 0, 0, 0, 111], 34, .98),
  ...Array.from({ length: 9 }, (_, i) =>
    c([150, 150, 150, 150, 12, 0, 50, 0, 111], 600, i >= 3 && i <= 6 ? .98 : 1, 1, 3)),
];

export const MOTION_DAMPENED = [
  false, true, true, false, true, true, false, true, true, true, true, true, true, true, true, true, true,
  false, false, false, false, false, false, false, false, false,
] as const; // index by source mode; index 0 is sentinel

export const ROTATION_DITHER = new Set([1, 9, 11]);
export const CUSTOM_VECTORS = new Set([6, 10, 12]);

export const CLASSIC = Object.freeze({
  volumeHistory: 120,
  fourierDetail: 24,
  selectableWaves: 6,
  nominalWeightSum: 256,
  defaultModeFramesAt30Hz: 550,
  defaultSimulationHz: 30,
  referenceSampleRate: 44_100,
});

export function adjustedThresholds(mode: number, trueColor: boolean): number[] {
  const out = [...CLASSIC_MODES[mode - 1]!.threshold];
  if (trueColor) {
    out[EFFECT.nuclide] = Math.min(900, Math.max(0, out[EFFECT.nuclide]! * 1.3));
    out[EFFECT.chasers] = Math.min(900, Math.max(0, out[EFFECT.chasers]! - 50));
    out[EFFECT.dots] = Math.min(900, out[EFFECT.dots]! + 220);
    out[EFFECT.bar] = Math.min(900, out[EFFECT.bar]! + 220);
    out[EFFECT.shade] = Math.min(900, out[EFFECT.shade]! + 150);
  }
  out[EFFECT.grid] = Math.min(1000, out[EFFECT.grid]! + 8);
  return out;
}

export function interpolationWeightSum(width: number, height: number): number {
  const area = width * height;
  if (area <= 320 * 240) return 250;
  if (area <= 400 * 300) return 251;
  if (area <= 512 * 384) return 252;
  if (area <= 800 * 600) return 253;
  if (area <= 1280 * 960) return 254;
  return 255;
}
