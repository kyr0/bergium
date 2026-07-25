import { test } from "vitest";
import assert from "node:assert/strict";
import "./../../src/pipelines/milkdrop/port/presetBase.js"; // install EEL globals (side-effect, like the vendored import)
import PresetEquationRunner, {
  type GlobalVars,
  type RunnerOpts,
} from "../../src/pipelines/milkdrop/port/presetEquationRunner.js";
import blankPreset from "../../src/pipelines/milkdrop/port/blankPreset.js";

const globalVars: GlobalVars = {
  frame: 0, time: 0, fps: 30, bass: 1, bass_att: 1,
  mid: 1, mid_att: 1, treb: 1, treb_att: 1,
};
const opts: RunnerOpts = {
  texsizeX: 1024, texsizeY: 768, mesh_width: 48, mesh_height: 36, aspectx: 1, aspecty: 1,
};

/**
 * Why: the ported blankPreset must match the vendored pinned source — structure
 * (baseVals, 4 waves, 4 shapes, warp/comp shaders) and equation behavior through
 * the ported PresetEquationRunner. Goldens captured from vendor/butterchurn.
 */
test("ported blankPreset matches vendored (structure + frame/pixel eqs)", () => {
  assert.equal(blankPreset.baseVals.decay as number, 0.9);
  assert.equal(blankPreset.baseVals.wave_mystery as number, -0.2);
  assert.equal(blankPreset.waves!.length, 4);
  assert.equal(blankPreset.shapes!.length, 4);
  assert.ok(blankPreset.warp.includes("shader_body"));
  assert.ok(blankPreset.comp.includes("hue_shader"));

  const r = new PresetEquationRunner(blankPreset, globalVars, opts);
  assert.equal(r.runVertEQs, true); // pixel_eqs is a function, not ""

  const f = r.runFrameEquations(globalVars);
  assert.equal(f.zoom, 1.03); // 1.01 + 0.02 * treb_att(1)
  assert.equal(f.warp, 0.4); // 0.15 + 0.25 * bass_att(1)
  assert.deepEqual(f.rkeys, ["warp"]);

  const px = r.runPixelEquations({ warp: f.warp, rad: 1 });
  assert.equal(px.warp, 0.55); // warp + rad * 0.15
});
