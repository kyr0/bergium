/**
 * EEL standard-function library (presetBase).
 *
 * Mechanical TypeScript port of vendor/butterchurn/src/presetBase.js (pinned
 * revision fbac2f6). These are the global functions that compiled MilkDrop preset
 * equations call (sqr, rand, pow, mod, sigmoid, ...). The vendored installs them on
 * `window`; this port installs them on `globalThis` (=== window in a browser, and
 * also resolves bare-global references there). `rand`/`randint` default to
 * Math.random and are overridden by the seeded RNG context for determinism.
 */

const EPSILON = 0.00001;

const isFiniteNumber = (num: number): boolean => Number.isFinite(num) && !Number.isNaN(num);

export const sqr = (x: number): number => x * x;
export const sqrt = (x: number): number => Math.sqrt(Math.abs(x));
export const log10 = (val: number): number => Math.log(val) * Math.LOG10E;
export const sign = (x: number): number => (x > 0 ? 1 : x < 0 ? -1 : 0);
export const rand = (x: number): number => {
  const xf = Math.floor(x);
  if (xf < 1) {
    return Math.random();
  }
  return Math.random() * xf;
};
export const randint = (x: number): number => Math.floor(rand(x));
export const bnot = (x: number): number => (Math.abs(x) < EPSILON ? 1 : 0);
export const pow = (x: number, y: number): number => {
  const z = Math.pow(x, y);
  if (!isFiniteNumber(z)) {
    // mostly from complex results
    return 0;
  }
  return z;
};
export const div = (x: number, y: number): number => (y === 0 ? 0 : x / y);
export const mod = (x: number, y: number): number => {
  if (y === 0) {
    return 0;
  }
  return Math.floor(x) % Math.floor(y);
};
export const bitor = (x: number, y: number): number => Math.floor(x) | Math.floor(y);
export const bitand = (x: number, y: number): number => Math.floor(x) & Math.floor(y);
export const sigmoid = (x: number, y: number): number => {
  const t = 1 + Math.exp(-x * y);
  return Math.abs(t) > EPSILON ? 1.0 / t : 0;
};
export const bor = (x: number, y: number): number => (Math.abs(x) > EPSILON || Math.abs(y) > EPSILON ? 1 : 0);
export const band = (x: number, y: number): number => (Math.abs(x) > EPSILON && Math.abs(y) > EPSILON ? 1 : 0);
export const equal = (x: number, y: number): number => (Math.abs(x - y) < EPSILON ? 1 : 0);
export const above = (x: number, y: number): number => (x > y ? 1 : 0);
export const below = (x: number, y: number): number => (x < y ? 1 : 0);
export const ifcond = (x: number, y: number, z: number): number => (Math.abs(x) > EPSILON ? y : z);
export const memcpy = (megabuf: number[], dst: number, src: number, len: number): number => {
  let destOffset = dst;
  let srcOffset = src;
  let copyLen = len;

  if (srcOffset < 0) {
    copyLen += srcOffset;
    destOffset -= srcOffset;
    srcOffset = 0;
  }

  if (destOffset < 0) {
    copyLen += destOffset;
    srcOffset -= destOffset;
    destOffset = 0;
  }

  if (copyLen > 0) {
    megabuf.copyWithin(destOffset, srcOffset, copyLen);
  }

  return dst;
};

/** Install the EEL globals on a target (defaults to the host global object). */
export function installPresetBaseGlobals(target: Record<string, unknown> = globalThis as Record<string, unknown>): void {
  Object.assign(target, {
    sqr, sqrt, log10, sign, rand, randint, bnot, pow, div, mod, bitor, bitand,
    sigmoid, bor, band, equal, above, below, ifcond, memcpy,
  });
}

// Match the vendored side-effect import: install on the host global at module load.
installPresetBaseGlobals();
