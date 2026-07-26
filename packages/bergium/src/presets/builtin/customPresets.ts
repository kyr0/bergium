/**
 * Hand-authored Milkdrop presets shipped with bergium-core.
 *
 * Each preset carries BOTH the string equations (`*_eqs_str`) AND function forms
 * (`*_eqs`): bergium's Milkdrop port deep-copies presets via JSON, which strips
 * functions, so the string forms survive and are recompiled at load time. The
 * function forms are retained only for direct (un-serialized) loading.
 *
 * The `warp`/`comp` fields are GLSL shader strings (frozen assets, inlined here on
 * purpose so consumers need no shader files).
 */
import type { LegacyMilkDropPreset } from "../types.js";

/** Minimal equation-function signature shared by custom presets. */
type EqFn = (m: Record<string, unknown>) => Record<string, unknown>;

/** Factory for a disabled wave slot (Milkdrop always carries 4). */
const makeWave = (): Record<string, unknown> => ({
  baseVals: {
    a: 1.0, enabled: 0.0, b: 1.0, g: 1.0, scaling: 1.0, samples: 512.0,
    additive: 0.0, usedots: 0.0, spectrum: 0.0, r: 1.0, smoothing: 0.5,
    thick: 0.0, sep: 0.0,
  },
  init_eqs_str: "",
  init_eqs: ((m): Record<string, unknown> => { m.rkeys = []; return m; }) as EqFn,
  frame_eqs_str: "",
  frame_eqs: ((m): Record<string, unknown> => m) as EqFn,
  point_eqs_str: "",
  point_eqs: "",
});

/** Factory for a disabled shape slot (Milkdrop always carries 4). */
const makeShape = (): Record<string, unknown> => ({
  baseVals: {
    r2: 0.0, a: 1.0, enabled: 0.0, b: 0.0, tex_ang: 0.0, thickoutline: 0.0,
    g: 0.0, textured: 0.0, g2: 1.0, tex_zoom: 1.0, additive: 0.0,
    border_a: 0.1, border_b: 1.0, b2: 0.0, a2: 0.0, r: 1.0,
    border_g: 1.0, rad: 0.1, x: 0.5, y: 0.5, ang: 0.0, sides: 4.0,
    border_r: 1.0,
  },
  init_eqs_str: "",
  init_eqs: ((m): Record<string, unknown> => { m.rkeys = []; return m; }) as EqFn,
  frame_eqs_str: "",
  frame_eqs: ((m): Record<string, unknown> => m) as EqFn,
});

/** The classic Milkdrop baseVals block shared by these presets. */
const sharedBaseVals = (overrides: Record<string, number>): Record<string, number> => ({
  gammaadj: 1.0, wave_g: 0.5, mv_x: 12.0, warpscale: 1.0, brighten: 0.0,
  mv_y: 9.0, wave_scale: 1.0, echo_alpha: 0.0, additivewave: 0.0, sx: 1.0,
  sy: 1.0, warp: 0.01, wave_mode: 0.0, wave_brighten: 0.0,
  wrap: 0.0, zoomexp: 1.0, fshader: 0.0, wave_r: 0.5, echo_zoom: 1.0,
  wave_smoothing: 0.75, warpanimspeed: 1.0, wave_dots: 0.0, wave_x: 0.5,
  wave_y: 0.5, zoom: 1.0, solarize: 0.0, modwavealphabyvolume: 0.0, dx: 0.0,
  cx: 0.5, dy: 0.0, darken_center: 0.0, cy: 0.5, invert: 0.0,
  bmotionvectorson: 0.0, rot: 0.0, modwavealphaend: 0.95, wave_mystery: -0.2,
  decay: 0.95, wave_a: 1.0, wave_b: 0.5, rating: 5.0, modwavealphastart: 0.75,
  darken: 0.0, echo_orient: 0.0, red_blue: 0.0,
  ...overrides,
});

const waves = () => [makeWave(), makeWave(), makeWave(), makeWave()];
const shapes = () => [makeShape(), makeShape(), makeShape(), makeShape()];

/** Preset: Warped Grid - polar-coordinate warp with audio-reactive zoom. */
const presetWarpGrid: LegacyMilkDropPreset = {
  name: "Warped Grid",
  baseVals: sharedBaseVals({ gammaadj: 1.25, mv_x: 12.0, warpscale: 1.0, warp: 0.01, decay: 0.95 }),
  init_eqs_str: "",
  // Note: compiled as `new Function("a", "... return a;")` - uses `a` as parameter
  frame_eqs_str: 'a.rkeys = ["warp"]; a.zoom = 1.0 + 0.02 * a.treb_att; a.warp = 0.1 + 0.2 * a.bass_att;',
  pixel_eqs_str: "a.warp = a.warp + a.rad * 0.2;",
  init_eqs: ((m): Record<string, unknown> => ({})) as EqFn,
  frame_eqs: ((m): Record<string, unknown> => {
    m.rkeys = ["warp"];
    m.zoom = 1.0 + 0.02 * Number(m.treb_att);
    m.warp = 0.1 + 0.2 * Number(m.bass_att);
    return m;
  }) as EqFn,
  pixel_eqs: ((m): Record<string, unknown> => {
    m.warp = Number(m.warp) + Number(m.rad) * 0.2;
    return m;
  }) as EqFn,
  warp: `shader_body {
  vec2 p = uv - 0.5;
  float d = length(p);
  float t = time*0.3;
  float angle = atan(p.y, p.x) + sin(t) * 0.5;
  float r = d + 0.1 * sin(8.0 * d - t * 3.0);
  vec2 warped = vec2(cos(angle), sin(angle)) * r + 0.5;
  ret = texture2D(sampler_main, warped).rgb;
  ret -= 0.003;
}`,
  comp: `shader_body {
  ret = texture2D(sampler_main, uv).rgb;
  ret *= hue_shader;
}`,
  waves: waves(),
  shapes: shapes(),
} as unknown as LegacyMilkDropPreset;

/** Preset: Tunnel Vision - radial tunnel warp. */
const presetTunnel: LegacyMilkDropPreset = {
  name: "Tunnel Vision",
  baseVals: sharedBaseVals({ warpscale: 2.5, warp: 0.5, decay: 0.98 }),
  init_eqs_str: "",
  // Uses `a` as compiled function parameter
  frame_eqs_str: 'a.rkeys = ["warp","zoom"]; a.zoom = 1.02 + 0.03 * a.mid_att; a.warp = 0.3 + 0.4 * a.bass_att;',
  pixel_eqs_str: "a.warp = a.warp + a.rad * 0.3;",
  init_eqs: ((m): Record<string, unknown> => ({})) as EqFn,
  frame_eqs: ((m): Record<string, unknown> => {
    m.rkeys = ["warp", "zoom"];
    m.zoom = 1.02 + 0.03 * Number(m.mid_att);
    m.warp = 0.3 + 0.4 * Number(m.bass_att);
    return m;
  }) as EqFn,
  pixel_eqs: ((m): Record<string, unknown> => {
    m.warp = Number(m.warp) + Number(m.rad) * 0.3;
    return m;
  }) as EqFn,
  warp: `shader_body {
  vec2 p = uv - 0.5;
  float r = length(p);
  float a = atan(p.y, p.x) + time*0.2;
  float t = r * 3.0 - time*0.5;
  vec2 tunnel = vec2(a * 0.5, 1.0 / (r + 0.01));
  tunnel.x += 0.1 * sin(t);
  tunnel.y += 0.1 * cos(t * 0.7);
  ret = texture2D(sampler_main, fract(tunnel * 0.3)).rgb;
  ret -= 0.002;
}`,
  comp: `shader_body {
  ret = texture2D(sampler_main, uv).rgb;
  ret *= 1.2;
  ret = clamp(ret, 0.0, 1.0);
}`,
  waves: waves(),
  shapes: shapes(),
} as unknown as LegacyMilkDropPreset;

/** Preset: Rubik's Cube - geometric grid with slow rotation. */
const presetRubiks: LegacyMilkDropPreset = {
  name: "Rubik's Cube",
  baseVals: sharedBaseVals({ warp: 0.02, decay: 1.0 }),
  init_eqs_str: "",
  // Uses `a` as compiled function parameter; globalThis.time is the butterchurn time global
  frame_eqs_str: 'a.rkeys = ["rot","sx","sy"]; a.rot = Math.sin(globalThis.time * 0.3) * 0.1 + 0.05 * a.treb_att; a.sx = 1.0 + 0.05 * a.bass_att; a.sy = 1.0 - 0.03 * a.mid_att;',
  pixel_eqs_str: "",
  init_eqs: ((m): Record<string, unknown> => ({})) as EqFn,
  frame_eqs: ((m): Record<string, unknown> => {
    m.rkeys = ["rot", "sx", "sy"];
    m.rot = Math.sin((globalThis as unknown as { time: number }).time * 0.3) * 0.1 + 0.05 * Number(m.treb_att);
    m.sx = 1.0 + 0.05 * Number(m.bass_att);
    m.sy = 1.0 - 0.03 * Number(m.mid_att);
    return m;
  }) as EqFn,
  pixel_eqs: ((m): Record<string, unknown> => m) as EqFn,
  warp: `shader_body {
  vec2 p = uv;
  float t = time * 0.2;
  p = p - 0.5;
  float angle = t + 0.5 * sin(t * 0.7);
  float c = cos(angle);
  float s = sin(angle);
  p = vec2(c * p.x - s * p.y, s * p.x + c * p.y);
  p = p + 0.5;
  float grid = 3.0;
  vec2 cell = floor(p * grid);
  vec2 frac = fract(p * grid);
  float edge = step(0.05, frac.x) * step(0.05, frac.y);
  ret = texture2D(sampler_main, p).rgb * edge;
}`,
  comp: `shader_body {
  ret = texture2D(sampler_main, uv).rgb;
  ret = pow(ret, vec3(0.9));
}`,
  waves: waves(),
  shapes: shapes(),
} as unknown as LegacyMilkDropPreset;

/** A named preset entry consumed by the built-in registry and `getBuiltinPresets`. */
export interface BuiltinPresetEntry {
  name: string;
  preset: unknown;
}

/** bergium's hand-authored presets, exposed first so they appear atop registries. */
export const CUSTOM_PRESETS: readonly BuiltinPresetEntry[] = [
  { name: "Bergium - Warped Grid", preset: presetWarpGrid },
  { name: "Bergium - Tunnel Vision", preset: presetTunnel },
  { name: "Bergium - Rubik's Cube", preset: presetRubiks },
];
