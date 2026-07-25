import { test } from "vitest";
import assert from "node:assert/strict";
import {
  GeissFrameGraph,
  type ClassicEffects,
  type WarpPass,
} from "../../src/pipelines/geiss/reference/GeissFrameGraph.js";
import type { IntensityFrame } from "../../src/pipelines/geiss/reference/FeedbackWarp.js";
import { GeissAudioAnalyzer } from "../../src/audio/geiss/GeissAudioAnalyzer.js";

// ---------------- Frame graph pass order ----------------

test("GeissFrameGraph executes the normative per-step pass order and swaps buffers", () => {
  const front: IntensityFrame = new Uint8Array(16);
  const back: IntensityFrame = new Uint8Array(16);
  const calls: string[] = [];
  let warpArgs: [IntensityFrame, IntensityFrame] | null = null;
  const tag = (f: IntensityFrame) => (f === front ? "front" : f === back ? "back" : "?");
  const eff = (name: string) => (f: IntensityFrame) => calls.push(`${name}:${tag(f)}`);
  const effects: ClassicEffects = {
    shade: eff("shade"), chasers: eff("chasers"), bar: eff("bar"), dots: eff("dots"),
    nuclide: eff("nuclide"), grid: eff("grid"), solar: eff("solar"),
    diminishCenter: eff("diminishCenter"), audioNuclide: eff("audioNuclide"), waveform: eff("waveform"),
  };
  const warp: WarpPass = {
    execute: (s, d) => {
      warpArgs = [s, d];
      calls.push("warp:front>back");
    },
  };
  const out = new GeissFrameGraph(front, back, effects, warp).step();

  // Pre-warp effects target front; warp reads front and writes back; post-warp target back.
  assert.deepEqual(calls, [
    "shade:front", "chasers:front", "bar:front", "dots:front", "nuclide:front",
    "grid:front", "solar:front", "diminishCenter:front",
    "warp:front>back",
    "audioNuclide:back", "waveform:back",
  ]);
  assert.deepEqual(warpArgs, [front, back]);
  assert.equal(out, back); // after swap, the returned frame is the newly-written back
});

// ---------------- Audio analyzer ----------------

const OPTS = {
  width: 640,
  fpsAtModeSwitch: 30,
  displayBits: 8 as const,
  visMode: "waveform" as const,
  waveform: 1 as const,
  useBeatDetection: true,
  slideShift: true,
};

test("GeissAudioAnalyzer: 8-bit profile leaves the 24-band Fourier arrays untouched (zero)", () => {
  const a = new GeissAudioAnalyzer();
  const g = a.analyze(new Int8Array(576), new Int8Array(576), OPTS, () => 0);
  assert.ok([...g.power].every((v) => v === 0));
  assert.ok([...g.powerSmoothed].every((v) => v === 0));
});

test("GeissAudioAnalyzer: silence yields zero volume", () => {
  const a = new GeissAudioAnalyzer();
  const g = a.analyze(new Int8Array(576), new Int8Array(576), OPTS, () => 0);
  assert.equal(g.currentVolume, 0);
});

test("GeissAudioAnalyzer: a loud alternating signal yields positive volume and is deterministic", () => {
  const left = new Int8Array(576);
  const right = new Int8Array(576);
  for (let i = 0; i < 576; i++) {
    left[i] = (i & 1) ? 100 : -100;
    right[i] = (i & 1) ? -100 : 100;
  }
  const a = new GeissAudioAnalyzer();
  const b = new GeissAudioAnalyzer();
  const ga = a.analyze(left, right, OPTS, () => 0);
  const gb = b.analyze(left, right, OPTS, () => 0);
  assert.ok(ga.currentVolume > 0);
  assert.deepEqual([...ga.sound].slice(0, 200), [...gb.sound].slice(0, 200));
  assert.equal(ga.beatStrength, gb.beatStrength);
});

test("GeissAudioAnalyzer: stateful history accumulates across frames", () => {
  const left = new Int8Array(576);
  const right = new Int8Array(576);
  for (let i = 0; i < 576; i++) left[i] = (i & 1) ? 90 : -90;
  const a = new GeissAudioAnalyzer();
  const g1 = a.analyze(left, right, OPTS, () => 0);
  const g2 = a.analyze(left, right, OPTS, () => 0);
  assert.notEqual(g1.averageVolume, g2.averageVolume);
});
