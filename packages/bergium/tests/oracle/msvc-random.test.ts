import { test } from "vitest";
import assert from "node:assert/strict";
import { MsvcRandom } from "../../src/pipelines/geiss/reference/MsvcRandom.js";

// Canonical Microsoft Visual C rand() output prefix for srand(1). These are the
// widely-published MSVC values; pinning them anchors the declared exact-profile
// PRNG to external ground truth (the remaining algebra test proves the full LCG
// trajectory, so a regression anywhere would also surface here). A divergence
// would silently reorder every mode/effect/palette/map selection downstream.
const MSVC_SEED1 = [
  41, 18467, 6334, 26500, 19169, 15724, 11478, 29358,
  26962, 24464, 5705, 28145, 23281, 16827, 9961,
];

test("MsvcRandom reproduces the canonical MSVC rand() sequence for seed 1", () => {
  const r = new MsvcRandom(1);
  const out = Array.from({ length: MSVC_SEED1.length }, () => r.nextRaw());
  assert.deepEqual(out, MSVC_SEED1);
});

test("MsvcRandom state transition is the MSVC LCG and exposes raw as the high 15 bits", () => {
  const r = new MsvcRandom(1);
  r.nextRaw();
  // state = (seed*214013 + 2531011) >>> 0  ;  raw = (state >>> 16) & 0x7fff
  const state = (Math.imul(1, 214013) + 2531011) >>> 0;
  assert.equal(r.snapshot(), state);
  assert.equal((state >>> 16) & 0x7fff, 41);
});

test("raw outputs are 15-bit unsigned (0..32767) across many seeds", () => {
  for (let seed = 0; seed < 4096; seed++) {
    const r = new MsvcRandom(seed);
    for (let i = 0; i < 16; i++) {
      const v = r.nextRaw();
      assert.ok(v >= 0 && v < 32768, `seed ${seed} produced ${v}`);
    }
  }
});

test("nextInt(maxExclusive) === nextRaw() % maxExclusive", () => {
  const a = new MsvcRandom(42);
  const b = new MsvcRandom(42);
  for (let i = 0; i < 8; i++) assert.equal(a.nextInt(1000), b.nextRaw() % 1000);
});

test("nextFloat() === nextRaw() / 32768", () => {
  const a = new MsvcRandom(7);
  const b = new MsvcRandom(7);
  for (let i = 0; i < 8; i++) assert.equal(a.nextFloat(), b.nextRaw() / 32768);
});

test("identical seeds yield byte-identical streams; differing seeds diverge", () => {
  const a = new MsvcRandom(12345);
  const b = new MsvcRandom(12345);
  const sa = Array.from({ length: 32 }, () => a.nextRaw());
  const sb = Array.from({ length: 32 }, () => b.nextRaw());
  assert.deepEqual(sa, sb);
  const c = new MsvcRandom(999);
  const sc = Array.from({ length: 32 }, () => c.nextRaw());
  assert.notDeepEqual(sa, sc);
});
