import { MOTION_DAMPENED } from "./ClassicConfig.js";
import type { Influence, MapParameters, RandomSource } from "./MapField.js";

const u = (r: RandomSource) => r.nextInt(1000) * .001;

/** Initializes one pending map in source statement order. */
export function createMapParameters(mode: number, width: number, height: number, cut: number, fpsAtModeSwitch: number, suggestedDamping: number, randomNoise: Float32Array, rng: RandomSource): MapParameters {
  const centerX = width / 2 - 1 + rng.nextInt(60) - 30, centerY = height / 2 - 1 + rng.nextInt(30) - 15;
  let damping = Math.max(.5, Math.min(1, suggestedDamping)); if (MOTION_DAMPENED[mode]) damping *= .5;
  let scale1 = 0, scale2 = 0, turn1 = 0, turn2 = 0, weightSum = 256;
  const influences: Influence[] = [];
  const protective = width > 640 ? 640 / width : 1;
  if (mode === 1) { scale1 = .985 - .12 * u(rng) ** 2; scale2 = scale1; turn1 = .01 + .01 * u(rng); turn2 = turn1; if (scale1 > .97 && rng.nextInt(3) === 1) turn1 *= -1; }
  else if (mode === 2) { scale1 = 1 + .02 * u(rng); turn1 = .02 + .07 * u(rng); }
  else if (mode === 3) { scale1 = .85 + .1 * u(rng); scale2 = scale1; turn1 = .01 + .015 * u(rng); turn2 = turn1; }
  else if (mode === 4) { turn1 = .007 + .02 * u(rng); turn2 = turn1; }
  else if (mode === 5) { turn1 = .01 + .03 * u(rng); turn2 = turn1; }
  else if (mode === 6) { for (let n = 0; n < 10; n++) { const x = rng.nextInt(width * 10) * .1, y = cut + rng.nextInt((height - cut * 2) * 10) * .1, angle = rng.nextInt(628) * .01, force = 1 + rng.nextInt(80) * .01; influences.push({ x, y, i: Math.cos(angle) * force, j: Math.sin(angle) * force, type: rng.nextInt(3) as 0 | 1 | 2 }); rng.nextInt(1200);/* radius retained only for PRNG compatibility */ } }
  else if (mode === 7) { turn1 = .01 + .01 * u(rng); turn2 = turn1; }
  else if (mode === 8) { turn1 = .05 * u(rng); turn2 = turn1; }
  else if (mode === 9) { scale1 = 1 + (.8 + .25 * u(rng) - 1) * protective; scale2 = scale1; turn1 = .01 + .03 * u(rng); turn2 = turn1; }
  else if (mode === 11) { scale1 = 1.008 + .008 * u(rng); scale2 = scale1; turn1 = .12 + .06 * u(rng); turn2 = turn1; turn1 *= -.6; turn2 *= .1; scale1 *= .99; scale2 *= 1.01; }
  else if (mode === 12) weightSum = Math.trunc(weightSum * .98);
  else if (mode === 13 || mode === 14 || mode === 16 || mode >= 17) { turn1 = .007 + .02 * u(rng); turn2 = turn1; }
  else if (mode === 15) { turn1 = .04 * u(rng) + .045 * u(rng); turn2 = turn1; }
  // The second mode===16 branch in C is unreachable and is not applied.
  if (rng.nextInt(2) === 1) { turn1 *= -1; turn2 *= -1; }
  let f1 = .92 + .05 * u(rng), f2 = .0009 + .0012 * u(rng), f3 = 0;
  if (mode === 5) { f1 = .05 + .05 * u(rng) + .07 * u(rng); f2 = .99 - .01 * u(rng) - .02 * u(rng); }
  else if (mode === 7) { f1 = .92 + .01 * u(rng); f2 = .0006 + .0005 * u(rng); }
  else if (mode === 8) { f1 = u(rng); f1 = f1 * f1 * f1 * f1 * 8 + 1.5; }
  else if (mode === 9) { f1 = .98 + .01 * u(rng); f2 = .0009 + .0012 * u(rng); }
  else if (mode === 13) f1 = .92 + .16 * u(rng);
  else if (mode === 15) { f1 = rng.nextInt(5) + 2; f2 = .92 + .06 * u(rng); f3 = .05 + .05 * u(rng); }
  else if (mode === 17) { f1 = .01 + .09 * u(rng); f2 = .01 + .09 * u(rng); f3 = .01 + .09 * u(rng); u(rng);/* f4 */ }
  turn1 *= .6; turn2 *= .6;
  return { mode, width, height, centerX, centerY, scale1, scale2, turn1, turn2, f1, f2, f3, damping, weightSum, fpsAtModeSwitch, nuclideSelected: false, influences, randomNoise, randomNoisePosition: { value: 0 } };
}

