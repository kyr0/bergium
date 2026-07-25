import { test } from "vitest";
import assert from "node:assert/strict";
import { createFrameClock, advanceFrameClock } from "../../src/pipelines/geiss/reference/FrameClock.js";
import { diminishCenter } from "../../src/pipelines/geiss/reference/DiminishCenter.js";

test("FrameClock advances floatframe by 1.6*min(1,47/fps) and ticks intframe/framesThisMode", () => {
  const c = createFrameClock();
  assert.equal(c.clearframes, 4);
  advanceFrameClock(c, 30); // min(1,47/30)=1 -> +1.6
  assert.equal(c.floatframe, 1.6);
  assert.equal(c.intframe, 1);
  assert.equal(c.framesThisMode, 1);
  assert.equal(c.clearframes, 4); // 1 % 11 != 0

  const h = createFrameClock();
  advanceFrameClock(h, 94); // min(1,47/94)=0.5 -> +0.8
  assert.equal(h.floatframe, 0.8);
  advanceFrameClock(h, 47); // +1.6
  assert.equal(h.floatframe, 0.8 + 1.6);
});

test("FrameClock flags clearframes=1 every 11th intframe", () => {
  const c = createFrameClock();
  for (let i = 0; i < 11; i++) advanceFrameClock(c, 30);
  assert.equal(c.intframe, 11);
  assert.equal(c.clearframes, 1);
});

test("diminishCenter: center cross decays with >1 guard (mode 3, dwind .99)", () => {
  const W = 16, H = 16;
  const f = new Uint8Array(W * H);
  const at = (x: number, y: number): number => y * W + x;
  // cross pixels around (5,5): center, left, right, down(>1->1), up(guard 1)
  f[at(5, 5)] = 200; f[at(4, 5)] = 150; f[at(6, 5)] = 120; f[at(5, 6)] = 2; f[at(5, 4)] = 1;
  f[at(7, 5)] = 200; // outside the cross -> unchanged
  f[at(3, 5)] = 7;   // outside the cross -> unchanged
  diminishCenter(f, { centerX: 5, centerY: 5, width: W, height: H, cut: 4, centerDwindle: 0.99, mode: 3 });
  assert.equal(f[at(5, 5)], 198); // trunc(200*.99)
  assert.equal(f[at(4, 5)], 148); // trunc(148.5)
  assert.equal(f[at(6, 5)], 118); // trunc(118.8)
  assert.equal(f[at(5, 6)], 1);   // 2 -> trunc(1.98)=1
  assert.equal(f[at(5, 4)], 1);   // guard: value 1 unchanged
  assert.equal(f[at(7, 5)], 200); // outside cross
  assert.equal(f[at(3, 5)], 7);   // outside cross
});

test("diminishCenter: no-op when centerDwindle >= 0.999", () => {
  const f = new Uint8Array(16 * 16);
  f[5 * 16 + 5] = 200;
  diminishCenter(f, { centerX: 5, centerY: 5, width: 16, height: 16, cut: 4, centerDwindle: 1.0, mode: 3 });
  assert.equal(f[5 * 16 + 5], 200);
});

test("diminishCenter: mode 12 vertical line decays with NO guard", () => {
  const W = 16, H = 16;
  const f = new Uint8Array(W * H);
  const at = (x: number, y: number): number => y * W + x;
  f[at(5, 4)] = 1;    // first row in range; no guard -> trunc(1*.915)=0
  f[at(5, 11)] = 100; // in range -> trunc(91.5)=91
  f[at(5, 12)] = 100; // y == H-cut -> out of range -> unchanged
  f[at(4, 4)] = 50;   // x=cx-1 in line -> trunc(45.75)=45
  f[at(6, 4)] = 50;   // x=cx+1 in line -> 45
  f[at(7, 4)] = 50;   // x=cx+2 -> out of line -> unchanged
  diminishCenter(f, { centerX: 5, centerY: 5, width: W, height: H, cut: 4, centerDwindle: 0.915, mode: 12 });
  assert.equal(f[at(5, 4)], 0); // 1 -> 0 (no guard)
  assert.equal(f[at(5, 11)], 91);
  assert.equal(f[at(5, 12)], 100); // out of range
  assert.equal(f[at(4, 4)], 45);
  assert.equal(f[at(6, 4)], 45);
  assert.equal(f[at(7, 4)], 50); // out of line
});
