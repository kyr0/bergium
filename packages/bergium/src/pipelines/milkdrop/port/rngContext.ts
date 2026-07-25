import { createRNGContext, createDefaultRNGContext, type RNGContext } from "./seededRandom.js";

/**
 * Global RNG context + EEL global (`window.rand`/`randint`, `Math.random`) override.
 *
 * Mechanical TypeScript port of vendor/butterchurn/src/utils/rngContext.js
 * (pinned revision fbac2f6). In deterministic/test mode it replaces the EEL random
 * globals with the seeded xorshift128+ generator so preset runs reproduce.
 */

interface ButterchurnWindow {
  rand: ((x: number) => number) | undefined;
  randint: ((x: number) => number) | undefined;
}

export interface RNGOptions {
  deterministic?: boolean | undefined;
  testMode?: boolean | undefined;
  seed?: number | undefined;
}

type RandFn = (x: number) => number;
type RandomFn = () => number;

let globalRNG: RNGContext | null = null;
let originalRand: RandFn | null = null;
let originalRandint: RandFn | null = null;
let originalMathRandom: RandomFn | null = null;

const win = (): ButterchurnWindow => window as unknown as ButterchurnWindow;
const math = Math as { random: RandomFn };

export function initializeRNG(opts: RNGOptions = {}): RNGContext {
  if (opts.deterministic || opts.testMode) {
    globalRNG = createRNGContext(opts.seed ?? 12345);
  } else {
    globalRNG = createDefaultRNGContext();
  }

  if (opts.deterministic || opts.testMode) {
    const w = win();
    if (!originalRand && w.rand) {
      originalRand = w.rand;
      originalRandint = w.randint ?? null;
    }

    if (!originalMathRandom) {
      originalMathRandom = math.random;
    }

    // Override the EEL globals with our seeded RNG.
    w.rand = ((x: number) => globalRNG!.rand(x)) as RandFn;
    w.randint = ((x: number) => globalRNG!.randint(x)) as RandFn;
    math.random = () => globalRNG!.random();
  }

  return globalRNG;
}

export function getRNG(): RNGContext {
  if (!globalRNG) {
    globalRNG = createDefaultRNGContext();
  }
  return globalRNG;
}

export function cleanup(): void {
  const w = win();
  if (originalRand) {
    w.rand = originalRand;
    w.randint = originalRandint ?? undefined;
    originalRand = null;
    originalRandint = null;
  }

  if (originalMathRandom) {
    math.random = originalMathRandom;
    originalMathRandom = null;
  }

  globalRNG = null;
}
