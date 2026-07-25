import { test } from "vitest";
import assert from "node:assert/strict";
import PresetEquationRunner, {
  type ButterchurnPreset,
  type GlobalVars,
  type RunnerOpts,
} from "../../src/pipelines/milkdrop/port/presetEquationRunner.js";

// Minimal preset with compiled JS equations, mirroring the vendored capture.
const preset = {
  baseVals: { zoom: 1, rot: 0, warp: 0 },
  init_eqs: (v: Record<string, unknown>) => { v.q1 = 5; v.q2 = 10; return v; },
  frame_eqs: (v: Record<string, unknown>) => { v.q1 = (v.q1 as number) + 1; v.zoom = 2; v.myUserVar = 7.5; return v; },
  pixel_eqs: "",
  waves: [],
  shapes: [],
} as unknown as ButterchurnPreset;

const globalVars: GlobalVars = {
  frame: 3, time: 0.1, fps: 30, bass: 1.5, bass_att: 1.2,
  mid: 1, mid_att: 1, treb: 1, treb_att: 1,
};
const opts: RunnerOpts = {
  texsizeX: 1024, texsizeY: 768, mesh_width: 48, mesh_height: 36, aspectx: 1, aspecty: 1,
};

/**
 * Why: the ported JS equation runner must match the vendored pinned source's
 * behavior - q init/frame eqs, q reset each frame, user-var carryover, globalVars
 * propagation, and the runVertEQs flag. Goldens captured from
 * vendor/butterchurn/src/equations/presetEquationRunner.js.
 */
test("ported PresetEquationRunner matches vendored (frame eqs, q reset, user-var carry)", () => {
  const r = new PresetEquationRunner(preset, globalVars, opts);
  assert.equal(r.runVertEQs, false);

  const frame = r.runFrameEquations(globalVars);
  assert.equal(frame.q1, 6); // init 5 + frame_eqs +1
  assert.equal(frame.q2, 10); // init carry
  assert.equal(frame.zoom, 2);
  assert.equal(frame.myUserVar, 7.5);
  assert.equal(frame.frame, 3); // globalVars propagated
  assert.equal(frame.bass, 1.5);
  assert.equal(frame.meshx, 48); // mesh_width
  assert.equal(frame.aspectx, 1); // invAspectx = 1/1

  // Second frame: q1 resets to its init (5) then +1 = 6; myUserVar carries over.
  const f2 = r.runFrameEquations({ ...globalVars, frame: 4 });
  assert.equal(f2.q1, 6);
  assert.equal(f2.myUserVar, 7.5);
  assert.equal(f2.zoom, 2);
});
