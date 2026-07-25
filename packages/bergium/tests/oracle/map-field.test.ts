import { test } from "vitest";
import assert from "node:assert/strict";
import {
  sourceCoordinate,
  quantizeMapTexel,
  type MapParameters,
} from "../../src/pipelines/geiss/reference/MapField.js";
import { createMapParameters } from "../../src/pipelines/geiss/reference/MapParameterFactory.js";
import { MsvcRandom } from "../../src/pipelines/geiss/reference/MsvcRandom.js";

const noise = (): Float32Array => new Float32Array(2345);
const rng = (): MsvcRandom => new MsvcRandom(1);

const base = (over: Partial<MapParameters>): MapParameters => ({
  mode: 2, width: 640, height: 480, centerX: 320, centerY: 240,
  scale1: 1, scale2: 1, turn1: 0, turn2: 0, f1: 0, f2: 0, f3: 0,
  damping: 1, weightSum: 256, fpsAtModeSwitch: 30, nuclideSelected: false,
  influences: [], randomNoise: noise(), randomNoisePosition: { value: 0 }, ...over,
});

test("sourceCoordinate: identity at center for an unmodified rotate/scale mode", () => {
  const [sx, sy] = sourceCoordinate(320, 240, base({}), rng());
  assert.equal(sx, 320);
  assert.equal(sy, 240);
});

test("sourceCoordinate: pure scale doubles the offset from center", () => {
  const [sx, sy] = sourceCoordinate(321, 240, base({ scale1: 2 }), rng());
  assert.equal(sx, 322); // dx=1 * scale 2
  assert.equal(sy, 240);
});

test("sourceCoordinate: mode 3 vertical falloff scale = .95 - dy*(480/H)*.0005", () => {
  const [sx, sy] = sourceCoordinate(320, 480, base({ mode: 3 }), rng());
  assert.equal(sx, 320); // dx=0
  assert.equal(sy, 240 * 0.83 + 240); // dy=240, scale=.95-.12=.83
});

test("sourceCoordinate: mode 16 radial pinch maps the center to itself", () => {
  const [sx, sy] = sourceCoordinate(320, 240, base({ mode: 16 }), rng());
  assert.equal(sx, 320);
  assert.equal(sy, 240);
});

test("quantizeMapTexel: identity damping keeps source==destination with byte weight sum", () => {
  const m = quantizeMapTexel(10, 10, base({}), rng());
  assert.equal(m.sourceX, 10);
  assert.equal(m.sourceY, 10);
  // sum = trunc(256 * interpolationWeightSum(640,480) / 256) = trunc(253) = 253
  assert.equal(m.w00, 253);
  assert.equal(m.w10, 0);
  assert.equal(m.w01, 0);
  assert.equal(m.w11, 0);
});

test("quantizeMapTexel: fractional source splits weight with independent per-tap truncation", () => {
  // mode 3 at (320,480) -> sy=439.2 (fy=0.2, fx=0)
  const m = quantizeMapTexel(320, 480, base({ mode: 3 }), rng());
  assert.equal(m.sourceX, 320);
  assert.equal(m.sourceY, 439);
  const sum = 253;
  assert.equal(m.w00, Math.trunc(0.8 * sum)); // (1-fy)=0.8 -> 202
  assert.equal(m.w01, Math.trunc(0.2 * sum)); // fy=0.2 -> 50
  assert.equal(m.w10, 0);
  assert.equal(m.w11, 0);
  // Independent truncation loses the fractional remainder: 202 + 50 = 252 < 253.
  assert.equal(m.w00 + m.w10 + m.w01 + m.w11, 252);
});

test("quantizeMapTexel: negative X wraps with period W-1", () => {
  // mode 2 scale1=2 at x=0: dx=-320 -> sx=-320 -> +639 -> 319
  const m = quantizeMapTexel(0, 240, base({ scale1: 2 }), rng());
  assert.equal(m.sourceX, 319);
  assert.equal(m.sourceY, 240);
});

test("quantizeMapTexel: flattened Y clamps to rows 2..H-3", () => {
  // mode 2 scale1=2 at y=2: dy=-238 -> sy=-236 -> clamped to row 2
  const m = quantizeMapTexel(0, 2, base({ scale1: 2 }), rng());
  assert.equal(m.sourceY, 2);
});

test("createMapParameters: mode 12 lowers weightSum to trunc(256*.98)=250", () => {
  const p = createMapParameters(12, 640, 480, 4, 30, 1, noise(), new MsvcRandom(1));
  assert.equal(p.weightSum, 250);
});

test("createMapParameters: mode 6 initializes ten influence fields but only five are read", () => {
  const p = createMapParameters(6, 640, 480, 4, 30, 1, noise(), new MsvcRandom(1));
  assert.equal(p.influences.length, 10);
});

test("createMapParameters: centers stay within the source jitter ranges", () => {
  for (let seed = 1; seed <= 500; seed++) {
    const p = createMapParameters(2, 640, 480, 4, 30, 1, noise(), new MsvcRandom(seed));
    assert.ok(p.centerX >= 320 - 1 - 30 && p.centerX <= 320 - 1 + 29, `cx ${p.centerX}`);
    assert.ok(p.centerY >= 240 - 1 - 15 && p.centerY <= 240 - 1 + 14, `cy ${p.centerY}`);
  }
});

test("createMapParameters: mode 1 checkerboard uses equal scale1/scale2", () => {
  const p = createMapParameters(1, 640, 480, 4, 30, 1, noise(), new MsvcRandom(1));
  assert.equal(p.scale1, p.scale2);
  assert.equal(p.nuclideSelected, false);
  assert.equal(p.randomNoisePosition.value, 0);
});

test("createMapParameters is deterministic for a fixed seed", () => {
  const a = createMapParameters(11, 640, 480, 4, 30, 1, noise(), new MsvcRandom(123));
  const b = createMapParameters(11, 640, 480, 4, 30, 1, noise(), new MsvcRandom(123));
  assert.deepEqual(a.influences, b.influences);
  assert.equal(a.scale1, b.scale1);
  assert.equal(a.turn1, b.turn1);
  assert.equal(a.centerX, b.centerX);
  assert.equal(a.f1, b.f1);
});

test("quantizeMapTexel: weights stay a valid convex sum even when the source maps negative (floor frac)", () => {
  // Regression: mode 2 scale pushes sy below 0 (Y has no wrap); with trunc the
  // fraction went negative and &255 wrapped it into weights like [107,144,255,255].
  // Floor keeps fx/fy in [0,1), so every weight is in [0, sum] and never a wrap.
  for (const seed of [1, 2, 3, 7, 42]) {
    const p = createMapParameters(2, 64, 48, 4, 30, 1, noise(), new MsvcRandom(seed));
    const rngMap = new MsvcRandom(seed * 97 + 1);
    const sum = Math.trunc((p.weightSum * 250) / 256); // interpolationWeightSum(64,48) === 250
    for (let y = 0; y < 48; y++) {
      for (let x = 0; x < 64; x++) {
        const m = quantizeMapTexel(x, y, p, rngMap);
        const ws = [m.w00, m.w10, m.w01, m.w11];
        for (const w of ws) assert.ok(w >= 0 && w <= sum, `negative-coord wrap artifact at (${x},${y}): ${ws}`);
        assert.ok(ws[0]! + ws[1]! + ws[2]! + ws[3]! <= sum + 4, `weight sum exceeds convex bound at (${x},${y})`);
      }
    }
  }
});
