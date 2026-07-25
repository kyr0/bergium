import { test } from "vitest";
import assert from "node:assert/strict";
import { crankPalette, createPalette, blendPalette } from "../../src/pipelines/geiss/reference/Palette.js";
import { MsvcRandom } from "../../src/pipelines/geiss/reference/MsvcRandom.js";
import { ScriptedRandom } from "./helpers.js";
import { renderWave } from "../../src/pipelines/geiss/reference/WaveformRenderer.js";

// ---------------- Palette ----------------

test("crankPalette: each curve maps z deterministically per the source formulas", () => {
  assert.equal(crankPalette(0, 64), 255); // default branch
  assert.equal(crankPalette(1, 64), Math.sqrt(64) * 22.6); // 180.8
  assert.equal(crankPalette(2, 100), 200);
  assert.equal(crankPalette(3, 64), 64);
  assert.equal(crankPalette(4, 256), 255); // sin(pi/2)=1
  assert.equal(crankPalette(5, 100), 350);
  assert.equal(crankPalette(7, 0), 64); // 0*1.5 + 64 + 64*sin(0)
});

test("createPalette: deterministic for a fixed seed and always 256 entries", () => {
  const a = createPalette(new MsvcRandom(5), 10, false, 1, 1);
  const b = createPalette(new MsvcRandom(5), 10, false, 1, 1);
  assert.equal(a.colors.length, 256);
  assert.deepEqual(a.colors, b.colors);
  for (const c of a.colors) {
    assert.ok(c.r >= 0 && c.g >= 0 && c.b >= 0 && Number.isFinite(c.r));
  }
});

test("createPalette: non-fx branch with scripted curves clamps to 8 bits", () => {
  // Scripted: nextInt(10)=5 (skip low/high), nextInt(6)=3 (skip fx), nextInt(5)=4 (max=6),
  // three nextInt(6)=2 -> curves [3,3,3]; gamma = 1 + 10*.01 = 1.1
  const { descriptor, colors } = createPalette(new ScriptedRandom(5, 3, 4, 2, 2, 2), 10, false, 1, 1);
  assert.deepEqual(descriptor, { fxPalette: null, curves: [3, 3, 3], lowBand: -1, highBand: -1 });
  assert.deepEqual(colors[0], { r: 0, g: 0, b: 0 });
  // z=64 -> crank(3,64)=64 ; *1.1=70.4 -> min(255,.)|0 = 70
  assert.deepEqual(colors[64], { r: 70, g: 70, b: 70 });
});

test("createPalette: fx branch lays out the [q,s,l] channel order for fx=0", () => {
  // Scripted: nextInt(10)=0 (enter low/high), nextInt(6)=5 (low=12), nextInt(6)=5 (high=22),
  // nextInt(6)=0 (fx branch), nextInt(4)=0 (fx=0)
  const { descriptor, colors } = createPalette(new ScriptedRandom(0, 5, 5, 0, 0), 10, false, 1, 1);
  assert.equal(descriptor.fxPalette, 0);
  assert.equal(descriptor.lowBand, 12);
  assert.equal(descriptor.highBand, 22);
  assert.deepEqual(colors[0], { r: 0, b: 0, g: 0 });
  // z=64: a=64, q=64, l=128, s=sqrt(64)*22.6=180.8 ; fx=0 -> {r:q, b:s, g:l}
  assert.deepEqual(colors[64], { r: 64, b: Math.sqrt(64) * 22.6, g: 128 });
});

test("blendPalette interpolates old->next by blendsLeft/18 with integer truncation", () => {
  const old = [{ r: 0, g: 0, b: 0 }];
  const next = [{ r: 255, g: 255, b: 255 }];
  assert.deepEqual(blendPalette(old, next, 18), [{ r: 0, g: 0, b: 0 }]); // a=1 -> old
  assert.deepEqual(blendPalette(old, next, 0), [{ r: 255, g: 255, b: 255 }]); // a=0 -> next
  assert.deepEqual(blendPalette(old, next, 9), [{ r: 127, g: 127, b: 127 }]); // a=.5 -> 127.5|0
});

// ---------------- Waveforms ----------------

const W = 640;
const H = 480;

const waveInput = (wave: 1 | 2 | 3 | 4 | 5 | 6, samples: Float32Array) => ({
  frame: new Uint8Array(W * H), width: W, height: H, cut: 4, hideCut: 0,
  centerX: 320, centerY: 240, mode: 1, waveform: wave, frameNumber: 0,
  samples, brightness: 200,
});

test("renderWave: waveform 1 (horizontal) paints the center row with max blending", () => {
  const i = waveInput(1, new Float32Array(W));
  renderWave(i);
  assert.equal(i.frame[240 * W + 0], 200);
  assert.equal(i.frame[240 * W + 320], 200);
  assert.equal(i.frame[239 * W + 0], 0);
  assert.equal(i.frame[241 * W + 0], 0);
});

test("renderWave: waveform 2 (twin horizontal) paints two rows straddling center", () => {
  const i = waveInput(2, new Float32Array(W));
  renderWave(i);
  // y1 = 240 - 57.6 = 182.4 -> row 182 ; y2 = 240 + 57.6 = 297.6 -> row 297
  assert.equal(i.frame[182 * W + 10], 200);
  assert.equal(i.frame[297 * W + 10], 200);
  assert.equal(i.frame[240 * W + 10], 0);
});

test("renderWave: waveform 3 (vertical) paints the center column", () => {
  const i = waveInput(3, new Float32Array(W));
  renderWave(i);
  assert.equal(i.frame[0 * W + 320], 200);
  assert.equal(i.frame[100 * W + 320], 200);
  assert.equal(i.frame[479 * W + 320], 200);
  assert.equal(i.frame[100 * W + 100], 0);
});

test("renderWave: waveforms 4,5,6 are deterministic and write within 0..255", () => {
  for (const w of [4, 5, 6] as const) {
    const a = waveInput(w, new Float32Array(W));
    const b = waveInput(w, new Float32Array(W));
    renderWave(a);
    renderWave(b);
    assert.deepEqual([...a.frame], [...b.frame]);
    assert.ok(a.frame.reduce((s, v) => s + v, 0) > 0, `wave ${w} wrote nothing`);
    assert.ok([...a.frame].every((v) => v >= 0 && v <= 255));
  }
});

test("renderWave: waveform 5 radial sits on the radius-60 circle; waveform 6 collapses to center", () => {
  const r5 = waveInput(5, new Float32Array(W));
  renderWave(r5);
  assert.equal(r5.frame[240 * W + 380], 200); // (320+60, 240)
  const r6 = waveInput(6, new Float32Array(W));
  renderWave(r6);
  assert.equal(r6.frame[240 * W + 320], 200); // center
});
