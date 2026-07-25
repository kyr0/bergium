import { CLASSIC_MODES, EFFECT, adjustedThresholds } from "./ClassicConfig.js";
import type { RandomSource } from "./MapField.js";

export function chooseMapWaveform(mode: number, rng: RandomSource): 1 | 2 | 3 | 4 | 5 | 6 {
  for (; ;) {
    const wave = (Math.trunc(rng.nextInt(6 * 3 - 1) / 3) + 1) as 1 | 2 | 3 | 4 | 5 | 6;
    if (mode === 6 && wave === 5) continue;
    if (mode === 12 && (wave === 4 || wave === 6)) continue;
    if (mode === 14 && (wave === 3 || wave === 4)) continue;
    if ((mode === 8 || mode === 23 || mode === 24) && wave === 6) continue;
    return wave;
  }
}

export interface SelectedMode {
  mode: number; effects: Int8Array; solarMax: number; centerDwindle: number;
  waveform: 0 | 1 | 2 | 3 | 4 | 5 | 6; visMode: "waveform" | "spectrum";
  slideShift: boolean; gridDirection: -1 | 1; initialSolarBurst: boolean;
}

/** Activation order mirrors the source and therefore preserves PRNG consumption. */
export function activateMode(mode: number, generatedWaveform: 1 | 2 | 3 | 4 | 5 | 6, trueColor: boolean, soundActive: boolean, soundEmpty: boolean, rng: RandomSource): SelectedMode {
  const c = CLASSIC_MODES[mode - 1]!, thresholds = adjustedThresholds(mode, trueColor), effects = new Int8Array(9);
  const slideShift = rng.nextInt(100) + 1 <= 33;
  for (let i = 0; i < 9; i++) {
    let threshold = thresholds[i]!; if (soundActive && !soundEmpty) threshold *= .7;
    effects[i] = rng.nextInt(1000) < threshold ? 1 : -1;
  }
  let count = effects.reduce((n, v) => n + (v > 0 ? 1 : 0), 0);
  if (!soundActive || soundEmpty) {
    while (count < c.minEffects) {
      let got = false;
      for (let j = 0; j < 9; j++)if (effects[j] === -1 && rng.nextInt(1000) < thresholds[j]! && !got) { effects[j] = 1; got = true; count++; }
    }
  }
  for (let j = 0; j < 9; j++)if (thresholds[j]! >= 1000) effects[j] = 1;
  while (count > c.maxEffects) { const j = rng.nextInt(9); if (effects[j] === 1 && thresholds[j]! < 1000) { effects[j] = -1; count--; } }
  if (effects[EFFECT.chasers] === 1) effects[EFFECT.chasers] = 1 + rng.nextInt(2);
  if (effects[EFFECT.grid] === 1) effects[EFFECT.bar] = -1;
  const initialSolarBurst = mode === 1 && rng.nextInt(2) === 0;
  const gridDirection = (rng.nextInt(2) * 2 - 1) as -1 | 1;
  let waveform: 0 | 1 | 2 | 3 | 4 | 5 | 6 = generatedWaveform, visMode: "waveform" | "spectrum" = "waveform";
  if (effects[EFFECT.nuclide]! > 0 && rng.nextInt(7) > 2) waveform = 0;
  if (mode === 10) { waveform = 1; if (rng.nextInt(4) > 0) visMode = "spectrum"; }
  if (mode === 15 && rng.nextInt(5) === 0) waveform = 5;
  if (effects[EFFECT.spectral] === 1) waveform = 0;
  return { mode, effects, solarMax: mode === 1 && trueColor ? 800 : c.solarMax, centerDwindle: c.centerDwindle, waveform, visMode, slideShift, gridDirection, initialSolarBurst };
}

export interface PendingMap { ready: boolean; threshold: number; }
export function shouldActivateMap(p: PendingMap, bigBeat: boolean, beatMode: boolean, rush: boolean, modeFrames: number): boolean {
  if (!p.ready) return false; if (rush || !beatMode || bigBeat) return true; p.threshold -= .2 / modeFrames; return false;
}
