import { test } from "vitest";
import assert from "node:assert/strict";
import { warpIntensity8, injectMax, injectAdd } from "../../src/pipelines/geiss/reference/FeedbackWarp.js";
import type { MapTexel } from "../../src/pipelines/geiss/reference/MapField.js";

const zero = (): MapTexel => ({ sourceX: 0, sourceY: 0, w00: 0, w10: 0, w01: 0, w11: 0 });

test("warpIntensity8: four integer taps are summed then >>> 8 (truncation, no rounding)", () => {
  const W = 10;
  const src = new Uint8Array(W * 12);
  src[5 * W + 5] = 200; src[5 * W + 6] = 100; src[6 * W + 5] = 50; src[6 * W + 6] = 25;
  const map: MapTexel[] = Array.from({ length: W * 12 }, zero);
  map[3 * W + 3] = { sourceX: 5, sourceY: 5, w00: 64, w10: 64, w01: 64, w11: 64 };
  const dst = new Uint8Array(W * 12);
  warpIntensity8(src, dst, map, W);
  // (200+100+50+25)*64 = 24000 ; 24000 >>> 8 = 93
  assert.equal(dst[3 * W + 3], 93);
});

test("warpIntensity8: a single dominant tap reproduces (p*w) >>> 8", () => {
  const width = 12;
  // Source must be a real 2D frame (>=2 rows) so the four-tap reads stay in bounds.
  const src = new Uint8Array(width * 2);
  src[3] = 200;
  const map: MapTexel[] = Array.from({ length: width }, zero);
  map[0] = { sourceX: 3, sourceY: 0, w00: 128, w10: 0, w01: 0, w11: 0 };
  const dst = new Uint8Array(width);
  warpIntensity8(src, dst, map, width);
  // 200*128 = 25600 ; >>> 8 = 100
  assert.equal(dst[0], 100);
});

test("injectMax writes only the greater value, clamped to 255 and truncated", () => {
  const f = new Uint8Array([100, 100, 100]);
  injectMax(f, 0, 200); assert.equal(f[0], 200);
  injectMax(f, 0, 50); assert.equal(f[0], 200); // smaller value ignored
  injectMax(f, 1, 300); assert.equal(f[1], 255); // clamp
  injectMax(f, 2, 199.9); assert.equal(f[2], 199); // trunc
  injectMax(f, -1, 200); injectMax(f, 3, 200); // out-of-range ignored
  assert.deepEqual([...f], [200, 255, 199]);
});

test("injectAdd saturates at 255 and truncates the addend", () => {
  const f = new Uint8Array([100, 100, 100, 100]);
  injectAdd(f, 0, 200); assert.equal(f[0], 255); // 300 -> 255
  injectAdd(f, 1, 50); assert.equal(f[1], 150);
  injectAdd(f, 2, 10.9); assert.equal(f[2], 110); // trunc(10.9)=10
  injectAdd(f, -1, 50); injectAdd(f, 99, 50); // out-of-range ignored
  assert.deepEqual([...f], [255, 150, 110, 100]);
});
