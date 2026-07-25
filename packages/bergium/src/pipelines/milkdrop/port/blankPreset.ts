import type { ButterchurnPreset, EqVars } from "./presetEquationRunner.js";

/**
 * BlankPreset - the default MilkDrop preset.
 *
 * Mechanical TypeScript port of vendor/butterchurn/src/blankPreset.js (pinned
 * revision fbac2f6). The source repeats the same wave/shape baseVals four times
 * (generated code); they are factored here (DRY) without changing any value. The
 * warp/comp fields are the GLSL shader strings (frozen assets). Verified against
 * the vendored source via the ported PresetEquationRunner in
 * tests/oracle/milkdrop-port-blank-preset.test.ts.
 */

const baseVals: Record<string, number> = {
  gammaadj: 1.25, wave_g: 0.5, mv_x: 12.0, warpscale: 1.0, brighten: 0.0,
  mv_y: 9.0, wave_scale: 1.0, echo_alpha: 0.0, additivewave: 0.0, sx: 1.0,
  sy: 1.0, warp: 0.01, red_blue: 0.0, wave_mode: 0.0, wave_brighten: 0.0,
  wrap: 0.0, zoomexp: 1.0, fshader: 0.0, wave_r: 0.5, echo_zoom: 1.0,
  wave_smoothing: 0.75, warpanimspeed: 1.0, wave_dots: 0.0, wave_x: 0.5,
  wave_y: 0.5, zoom: 1.0, solarize: 0.0, modwavealphabyvolume: 0.0, dx: 0.0,
  cx: 0.5, dy: 0.0, darken_center: 0.0, cy: 0.5, invert: 0.0,
  bmotionvectorson: 0.0, rot: 0.0, modwavealphaend: 0.95, wave_mystery: -0.2,
  decay: 0.9, wave_a: 1.0, wave_b: 0.5, rating: 5.0, modwavealphastart: 0.75,
  darken: 0.0, echo_orient: 0.0, ib_r: 0.5, ib_g: 0.5, ib_b: 0.5, ib_a: 0.0,
  ib_size: 0.0, ob_r: 0.5, ob_g: 0.5, ob_b: 0.5, ob_a: 0.0, ob_size: 0.0,
  mv_dx: 0.0, mv_dy: 0.0, mv_a: 0.0, mv_r: 0.5, mv_g: 0.5, mv_b: 0.5, mv_l: 0.0,
};

const waveBaseVals: Record<string, number> = {
  a: 1.0, enabled: 0.0, b: 1.0, g: 1.0, scaling: 1.0, samples: 512.0,
  additive: 0.0, usedots: 0.0, spectrum: 0.0, r: 1.0, smoothing: 0.5, thick: 0.0, sep: 0.0,
};
const waveInitEqs = (m: EqVars): EqVars => {
  m.rkeys = [];
  return m;
};
const waveFrameEqs = (m: EqVars): EqVars => m;
const makeWave = () => ({ baseVals: { ...waveBaseVals }, init_eqs: waveInitEqs, frame_eqs: waveFrameEqs, point_eqs: "" });

const shapeBaseVals: Record<string, number> = {
  r2: 0.0, a: 1.0, enabled: 0.0, b: 0.0, tex_ang: 0.0, thickoutline: 0.0, g: 0.0,
  textured: 0.0, g2: 1.0, tex_zoom: 1.0, additive: 0.0, border_a: 0.1, border_b: 1.0,
  b2: 0.0, a2: 0.0, r: 1.0, border_g: 1.0, rad: 0.1, x: 0.5, y: 0.5, ang: 0.0,
  sides: 4.0, border_r: 1.0,
};
const shapeInitEqs = (m: EqVars): EqVars => {
  m.rkeys = [];
  return m;
};
const shapeFrameEqs = (m: EqVars): EqVars => m;
const makeShape = () => ({ baseVals: { ...shapeBaseVals }, init_eqs: shapeInitEqs, frame_eqs: shapeFrameEqs });

export interface BlankPreset extends ButterchurnPreset {
  warp: string;
  comp: string;
}

const pmap = {
  baseVals,
  // String equations survive JSON.parse(JSON.stringify()) which strips functions.
  // Compiled at runtime as `new Function("a", frame_eqs_str + "; return a;")`.
  init_eqs_str: "",
  frame_eqs_str: 'a.rkeys = ["warp"]; a.zoom = 1.01 + 0.02 * a.treb_att; a.warp = 0.15 + 0.25 * a.bass_att;',
  pixel_eqs_str: "a.warp = a.warp + a.rad * 0.15;",
  init_eqs: (): EqVars => ({}),
  frame_eqs: (m: EqVars): EqVars => {
    m.rkeys = ["warp"];
    m.zoom = 1.01 + 0.02 * (m.treb_att as number);
    m.warp = 0.15 + 0.25 * (m.bass_att as number);
    return m;
  },
  pixel_eqs: (m: EqVars): EqVars => {
    m.warp = (m.warp as number) + (m.rad as number) * 0.15;
    return m;
  },
  waves: [makeWave(), makeWave(), makeWave(), makeWave()],
  shapes: [makeShape(), makeShape(), makeShape(), makeShape()],
  warp: "shader_body {\nret = texture2D(sampler_main, uv).rgb;\nret -= 0.004;\n}\n",
  comp: "shader_body {\nret = texture2D(sampler_main, uv).rgb;\nret *= hue_shader;\n}\n",
};

export default pmap as BlankPreset;
