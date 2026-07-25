import { test } from "vitest";
import assert from "node:assert/strict";
import {
  CLASSIC_MODES,
  EFFECT,
  MOTION_DAMPENED,
  ROTATION_DITHER,
  CUSTOM_VECTORS,
  CLASSIC,
  adjustedThresholds,
  interpolationWeightSum,
} from "../../src/pipelines/geiss/reference/ClassicConfig.js";

test("CLASSIC_MODES has exactly the 25 source modes", () => {
  assert.equal(CLASSIC_MODES.length, 25);
});

test("mode 1 carries its documented threshold vector, solarMax and center", () => {
  assert.deepEqual([...CLASSIC_MODES[0]!.threshold], [220, 150, 10, 680, 4, 170, 400, 0, 111]);
  assert.equal(CLASSIC_MODES[0]!.solarMax, 400);
  assert.equal(CLASSIC_MODES[0]!.centerDwindle, 1);
});

test("every mode's ninth (unnamed) threshold is the 1000/9 constructor default 111", () => {
  for (const m of CLASSIC_MODES) assert.equal(m.threshold[8], 111);
});

test("spot mode constants: m11 solarMax 750, m12 center .915, m2 max 5, m10 min 0", () => {
  assert.equal(CLASSIC_MODES[10]!.solarMax, 750);
  assert.equal(CLASSIC_MODES[11]!.centerDwindle, 0.915);
  assert.equal(CLASSIC_MODES[1]!.maxEffects, 5);
  assert.equal(CLASSIC_MODES[9]!.minEffects, 0);
});

test("EFFECT indices are frozen in source declaration order", () => {
  assert.deepEqual(EFFECT, {
    chasers: 0, bar: 1, dots: 2, solar: 3, grid: 4, nuclide: 5, shade: 6, spectral: 7,
  });
});

test("MOTION_DAMPENED is indexed by source mode with a sentinel at index 0", () => {
  assert.equal(MOTION_DAMPENED.length, 26);
  assert.equal(MOTION_DAMPENED[0], false);
});

test("ROTATION_DITHER and CUSTOM_VECTORS match the documented mode sets", () => {
  assert.deepEqual([...ROTATION_DITHER].sort((x, y) => x - y), [1, 9, 11]);
  assert.deepEqual([...CUSTOM_VECTORS].sort((x, y) => x - y), [6, 10, 12]);
});

test("CLASSIC global constants match the reference", () => {
  assert.equal(CLASSIC.volumeHistory, 120);
  assert.equal(CLASSIC.fourierDetail, 24);
  assert.equal(CLASSIC.selectableWaves, 6);
  assert.equal(CLASSIC.nominalWeightSum, 256);
  assert.equal(CLASSIC.defaultModeFramesAt30Hz, 550);
  assert.equal(CLASSIC.defaultSimulationHz, 30);
  assert.equal(CLASSIC.referenceSampleRate, 44100);
});

test("adjustedThresholds: 8-bit only adds +8 to grid (capped at 1000)", () => {
  assert.deepEqual([...adjustedThresholds(1, false)], [220, 150, 10, 680, 12, 170, 400, 0, 111]);
});

test("adjustedThresholds: true-color modifies nuclide/chasers/dots/bar/shade per docs (mode 1)", () => {
  // nuclide 170*1.3=221, chasers 220-50=170, dots 10+220=230, bar 150+220=370, shade 400+150=550, grid 4+8=12
  assert.deepEqual([...adjustedThresholds(1, true)], [170, 370, 230, 680, 12, 221, 550, 0, 111]);
});

test("adjustedThresholds true-color clamps dots/bar to 900 and never goes negative (mode 2)", () => {
  const t = adjustedThresholds(2, true);
  assert.equal(t[EFFECT.dots], 900); // 750+220 clamped
  assert.equal(t[EFFECT.bar], 720); // 500+220
  assert.equal(t[EFFECT.nuclide], 0); // 0*1.3 floored at 0
  assert.equal(t[EFFECT.grid], 8); // 0+8
});

test("interpolationWeightSum selects by pixel-area thresholds (incl. 640x480)", () => {
  assert.equal(interpolationWeightSum(320, 240), 250);
  assert.equal(interpolationWeightSum(400, 300), 251);
  assert.equal(interpolationWeightSum(512, 384), 252);
  assert.equal(interpolationWeightSum(640, 480), 253);
  assert.equal(interpolationWeightSum(800, 600), 253);
  assert.equal(interpolationWeightSum(1280, 960), 254);
  assert.equal(interpolationWeightSum(1920, 1080), 255);
});
