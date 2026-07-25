/**
 * Bergium Demo - milkdrop/geiss visualizer powered by bergium-core
 *
 * Creates a full-screen canvas, initializes either the milkdrop pipeline
 * (TypeScript-native butterchurn port) or geiss pipeline (GPU frame graph),
 * and renders animation frames driven by the audio analyser's frequency data.
 */

import {
  createVisualizer,
  type BergiumVisualizer,
  type VisualizerOptions,
  BlankPreset,
  type LegacyMilkDropPreset,
  GeissAdapter,
} from "bergium-core";

// --- Inline milkdrop presets (CJS butterchurn-presets unavailable in Vite ESM) -
//
// butterchurn.loadPreset does JSON.stringify => JSON.parse (deep-copy), which
// STRIPS all function properties. After parsing, it checks for init_eqs_str
// (string equations) to decide the JS compile path. Therefore every preset
// must provide BOTH function AND string versions of equations so that after
// serialization the string versions survive for recompilation.

const makeWave = () => ({
  baseVals: {
    a: 1.0, enabled: 0.0, b: 1.0, g: 1.0, scaling: 1.0, samples: 512.0,
    additive: 0.0, usedots: 0.0, spectrum: 0.0, r: 1.0, smoothing: 0.5,
    thick: 0.0, sep: 0.0,
  },
  init_eqs_str: "",
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  init_eqs: (m: any): typeof m => { m.rkeys = []; return m; },
  frame_eqs_str: "",
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  frame_eqs: (m: any): typeof m => m,
  point_eqs_str: "",
  point_eqs: "",
});

const makeShape = () => ({
  baseVals: {
    r2: 0.0, a: 1.0, enabled: 0.0, b: 0.0, tex_ang: 0.0, thickoutline: 0.0,
    g: 0.0, textured: 0.0, g2: 1.0, tex_zoom: 1.0, additive: 0.0,
    border_a: 0.1, border_b: 1.0, b2: 0.0, a2: 0.0, r: 1.0,
    border_g: 1.0, rad: 0.1, x: 0.5, y: 0.5, ang: 0.0, sides: 4.0,
    border_r: 1.0,
  },
  init_eqs_str: "",
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  init_eqs: (m: any): typeof m => { m.rkeys = []; return m; },
  frame_eqs_str: "",
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  frame_eqs: (m: any): typeof m => m,
});

// Preset: Warped Grid - polar-coordinate warp with audio-reactive zoom
const presetWarpGrid = {
  name: "Warped Grid",
  baseVals: {
    gammaadj: 1.25, wave_g: 0.5, mv_x: 12.0, warpscale: 1.0, brighten: 0.0,
    mv_y: 9.0, wave_scale: 1.0, echo_alpha: 0.0, additivewave: 0.0, sx: 1.0,
    sy: 1.0, warp: 0.01, wave_mode: 0.0, wave_brighten: 0.0,
    wrap: 0.0, zoomexp: 1.0, fshader: 0.0, wave_r: 0.5, echo_zoom: 1.0,
    wave_smoothing: 0.75, warpanimspeed: 1.0, wave_dots: 0.0, wave_x: 0.5,
    wave_y: 0.5, zoom: 1.0, solarize: 0.0, modwavealphabyvolume: 0.0, dx: 0.0,
    cx: 0.5, dy: 0.0, darken_center: 0.0, cy: 0.5, invert: 0.0,
    bmotionvectorson: 0.0, rot: 0.0, modwavealphaend: 0.95, wave_mystery: -0.2,
    decay: 0.95, wave_a: 1.0, wave_b: 0.5, rating: 5.0, modwavealphastart: 0.75,
    darken: 0.0, echo_orient: 0.0, red_blue: 0.0,
  },
  init_eqs_str: "",
  // Note: compiled as `new Function("a", "m.rkeys = ... return a;")` - uses `a` as parameter
  frame_eqs_str: 'a.rkeys = ["warp"]; a.zoom = 1.0 + 0.02 * a.treb_att; a.warp = 0.1 + 0.2 * a.bass_att;',
  pixel_eqs_str: "a.warp = a.warp + a.rad * 0.2;",
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  init_eqs: (m: any): typeof m => ({}),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  frame_eqs: (m: any): typeof m => {
    m.rkeys = ["warp"];
    m.zoom = 1.0 + 0.02 * Number(m.treb_att);
    m.warp = 0.1 + 0.2 * Number(m.bass_att);
    return m;
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  pixel_eqs: (m: any): typeof m => {
    m.warp = Number(m.warp) + Number(m.rad) * 0.2;
    return m;
  },
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
  waves: [makeWave(), makeWave(), makeWave(), makeWave()],
  shapes: [makeShape(), makeShape(), makeShape(), makeShape()],
} as unknown as LegacyMilkDropPreset;

// Preset: Tunnel Vision - radial tunnel warp
const presetTunnel = {
  name: "Tunnel Vision",
  baseVals: {
    gammaadj: 1.0, wave_g: 0.5, mv_x: 12.0, warpscale: 2.5, brighten: 0.0,
    mv_y: 9.0, wave_scale: 1.0, echo_alpha: 0.0, additivewave: 0.0, sx: 1.0,
    sy: 1.0, warp: 0.5, wave_mode: 0.0, wave_brighten: 0.0,
    wrap: 0.0, zoomexp: 1.0, fshader: 0.0, wave_r: 0.5, echo_zoom: 1.0,
    wave_smoothing: 0.75, warpanimspeed: 1.0, wave_dots: 0.0, wave_x: 0.5,
    wave_y: 0.5, zoom: 1.0, solarize: 0.0, modwavealphabyvolume: 0.0, dx: 0.0,
    cx: 0.5, dy: 0.0, darken_center: 0.0, cy: 0.5, invert: 0.0,
    bmotionvectorson: 0.0, rot: 0.0, modwavealphaend: 0.95, wave_mystery: -0.2,
    decay: 0.98, wave_a: 1.0, wave_b: 0.5, rating: 5.0, modwavealphastart: 0.75,
    darken: 0.0, echo_orient: 0.0, red_blue: 0.0,
  },
  init_eqs_str: "",
  // Uses `a` as compiled function parameter
  frame_eqs_str: 'a.rkeys = ["warp","zoom"]; a.zoom = 1.02 + 0.03 * a.mid_att; a.warp = 0.3 + 0.4 * a.bass_att;',
  pixel_eqs_str: "a.warp = a.warp + a.rad * 0.3;",
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  init_eqs: (m: any): typeof m => ({}),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  frame_eqs: (m: any): typeof m => {
    m.rkeys = ["warp", "zoom"];
    m.zoom = 1.02 + 0.03 * Number(m.mid_att);
    m.warp = 0.3 + 0.4 * Number(m.bass_att);
    return m;
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  pixel_eqs: (m: any): typeof m => {
    m.warp = Number(m.warp) + Number(m.rad) * 0.3;
    return m;
  },
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
  waves: [makeWave(), makeWave(), makeWave(), makeWave()],
  shapes: [makeShape(), makeShape(), makeShape(), makeShape()],
} as unknown as LegacyMilkDropPreset;

// Preset: Rubik's Cube - geometric grid with slow rotation
const presetRubiks = {
  name: "Rubik's Cube",
  baseVals: {
    gammaadj: 1.0, wave_g: 0.5, mv_x: 12.0, warpscale: 1.0, brighten: 0.0,
    mv_y: 9.0, wave_scale: 1.0, echo_alpha: 0.0, additivewave: 0.0, sx: 1.0,
    sy: 1.0, warp: 0.02, wave_mode: 0.0, wave_brighten: 0.0,
    wrap: 0.0, zoomexp: 1.0, fshader: 0.0, wave_r: 0.5, echo_zoom: 1.0,
    wave_smoothing: 0.75, warpanimspeed: 1.0, wave_dots: 0.0, wave_x: 0.5,
    wave_y: 0.5, zoom: 1.0, solarize: 0.0, modwavealphabyvolume: 0.0, dx: 0.0,
    cx: 0.5, dy: 0.0, darken_center: 0.0, cy: 0.5, invert: 0.0,
    bmotionvectorson: 0.0, rot: 0.0, modwavealphaend: 0.95, wave_mystery: -0.2,
    decay: 1.0, wave_a: 1.0, wave_b: 0.5, rating: 5.0, modwavealphastart: 0.75,
    darken: 0.0, echo_orient: 0.0, red_blue: 0.0,
  },
  init_eqs_str: "",
  // Uses `a` as compiled function parameter; globalThis.time is the butterchurn time global
  frame_eqs_str: 'a.rkeys = ["rot","sx","sy"]; a.rot = Math.sin(globalThis.time * 0.3) * 0.1 + 0.05 * a.treb_att; a.sx = 1.0 + 0.05 * a.bass_att; a.sy = 1.0 - 0.03 * a.mid_att;',
  pixel_eqs_str: "",
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  init_eqs: (m: any): typeof m => ({}),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  frame_eqs: (m: any): typeof m => {
    m.rkeys = ["rot", "sx", "sy"];
    m.rot = Math.sin((globalThis as unknown as { time: number }).time * 0.3) * 0.1 + 0.05 * Number(m.treb_att);
    m.sx = 1.0 + 0.05 * Number(m.bass_att);
    m.sy = 1.0 - 0.03 * Number(m.mid_att);
    return m;
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  pixel_eqs: (m: any): typeof m => m,
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
  waves: [makeWave(), makeWave(), makeWave(), makeWave()],
  shapes: [makeShape(), makeShape(), makeShape(), makeShape()],
} as unknown as LegacyMilkDropPreset;

// --- Preset loading from butterchurn-presets package --------------------------

// Presets that are known to crash or render incorrectly (from vendor/milkymilky)
const DISABLED_PRESET_NAMES = new Set([
  "martin - The bridge",
  "sawtooth grin roam",
  "martin - extreme heat",
  "_Geiss - Desert Rose 2",
  "Idiot - Star Of Annon",
  "martin + flexi - diamond cutter [prismaticvortex.com] - camille - i wish i wish i wish i was constrained",
  "martin - fruit machine",
  "martin - The Bridge of Khazad-Dum",
  "martin - frosty caves 2",
  "martin - witchcraft reloaded",
  "martin - chain breaker",
  "_Geiss - untitled",
  "Milk Artist At our Best - FED - SlowFast Ft AdamFX n Martin - HD CosmoFX",
  "Geiss + Flexi + Martin - disconnected",
  "Unchained & Rovastar - Wormhole Pillars (Hall of Shadows mix)",
]);

// Load all presets from butterchurn-presets (CJS, pre-bundled by Vite optimizeDeps)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
import butterchurnPresetsRaw from "butterchurn-presets";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const butterchurnPresets = (butterchurnPresetsRaw as any).default ?? butterchurnPresetsRaw;
const allPresets: Record<string, unknown> = butterchurnPresets.getPresets();

// Build the preset registry: Bergium Blank + all non-disabled butterchurn presets
const PRESETS: { label: string; preset: unknown }[] = [
  { label: "Bergium Blank", preset: BlankPreset },
  ...Object.keys(allPresets)
    .filter((name) => !DISABLED_PRESET_NAMES.has(name))
    .sort()
    .map((name) => ({ label: name, preset: allPresets[name] })),
];

// --- DOM bootstrap -----------------------------------------------------------

const canvas = document.createElement("canvas");
canvas.id = "visualizer-canvas";
canvas.style.cssText = `
  position: fixed;
  top: 0; left: 0;
  width: 100vw; height: 100vh;
  display: block;
`;
document.body.appendChild(canvas);
document.body.style.cssText = "margin: 0; overflow: hidden; background: #000;";

// --- Audio setup (playlist - numerically sorted) -----------------------------

const PLAYLIST = [
  "/sample_data/1_fluctura-Springtime_Intro.mp3",
  "/sample_data/2_fluctura-The_Sunrise.mp3",
  "/sample_data/3_fluctura-Wisdom_of_the_Heart.mp3",
  "/sample_data/4_fluctura-Flora.mp3",
  "/sample_data/5_fluctura-Dance_of_the_Nightingale.mp3",
];
let trackIdx = 0;
const audio = new Audio();
audio.src = PLAYLIST[0]!;

/** Extract a human-readable track name from the URL path. */
function trackName(url: string): string {
  const parts = url.split("/");
  return parts[parts.length - 1]!
    .replace(/\.mp3$/, "")
    .replace(/^\d+_/, "")
    .replace(/_/g, " ")
    .replace(/-(?=\S)/g, " - ");
}

/** Show the song title animation on the visualizer (pipeline-agnostic). */
function showTrackTitle(): void {
  viz.launchSongTitleAnim(trackName(PLAYLIST[trackIdx]!));
}

/** Advance to the next track and play it. Updates the track label. */
function playNextTrack(): void {
  trackIdx = (trackIdx + 1) % PLAYLIST.length;
  audio.src = PLAYLIST[trackIdx]!;
  trackLabel.textContent = trackName(PLAYLIST[trackIdx]!);
  audio.play();
  showTrackTitle();
}

// Auto-advance to next track when current one ends
audio.addEventListener("ended", playNextTrack);

// --- Controls UI (DOM API - avoids innerHTML HTML-parsing edge cases) ---------

/** Shared style constants for consistent look across all controls. */
const CTRL_BTN_STYLE = "background:rgba(255,255,255,0.15);border:1px solid rgba(255,255,255,0.3);color:#fff;padding:8px 16px;border-radius:4px;cursor:pointer;font-size:13px;";
const CTRL_SELECT_STYLE = "background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.2);color:#fff;padding:4px 8px;border-radius:4px;font-size:12px;cursor:pointer;";
const CTRL_LABEL_STYLE = "color:rgba(255,255,255,0.5);font-size:12px;";
const CTRL_SMALL_BTN_STYLE = "background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.2);color:#fff;padding:4px 10px;border-radius:4px;cursor:pointer;font-size:12px;";

/** Creates a flex row container for grouping related controls. */
function makeRow(): HTMLDivElement {
  const row = document.createElement("div");
  row.style.cssText = "display:flex;gap:8px;align-items:center;";
  return row;
}

/** Creates a <label> element with shared styling. */
function makeLabel(text: string): HTMLLabelElement {
  const label = document.createElement("label");
  label.style.cssText = CTRL_LABEL_STYLE;
  label.textContent = text;
  return label;
}

/** Creates a <select> with shared styling and populates options from entries. */
function makeSelect(id: string, options: { value: string; text: string }[]): HTMLSelectElement {
  const select = document.createElement("select");
  select.id = id;
  select.style.cssText = CTRL_SELECT_STYLE;
  for (const opt of options) {
    const option = document.createElement("option");
    option.value = opt.value;
    option.textContent = opt.text;
    select.appendChild(option);
  }
  return select;
}

const controls = document.createElement("div");
controls.style.cssText = "position:fixed;top:16px;left:16px;z-index:10;display:flex;flex-direction:column;gap:10px;align-items:flex-start;font-family:sans-serif;background:rgba(0,0,0,0.5);padding:12px 16px;border-radius:8px;backdrop-filter:blur(8px);";

// Row 1: Play button + status
const playRow = makeRow();
const playBtn = document.createElement("button");
playBtn.id = "play-btn";
playBtn.style.cssText = CTRL_BTN_STYLE;
playBtn.textContent = "▶ Play";
const statusLabel = document.createElement("span");
statusLabel.id = "status-label";
statusLabel.style.cssText = "color:rgba(255,255,255,0.5);font-size:12px;font-family:monospace;";
statusLabel.textContent = "Milkdrop";
// Track name display
const trackLabel = document.createElement("span");
trackLabel.id = "track-label";
trackLabel.style.cssText = "color:rgba(255,255,255,0.7);font-size:12px;font-family:monospace;max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";
trackLabel.textContent = trackName(PLAYLIST[0]!);
playRow.append(playBtn, statusLabel, trackLabel);

// Row 2: Pipeline selector
const pipelineRow = makeRow();
const pipelineSelect = makeSelect("pipeline-select", [
  { value: "milkdrop", text: "Milkdrop" },
  { value: "geiss", text: "Geiss" },
]);
pipelineRow.append(makeLabel("Pipeline:"), pipelineSelect);

// Row 3: Preset selector (Milkdrop only)
const presetRow = makeRow();
presetRow.id = "preset-row";
const presetSelect = makeSelect(
  "preset-select",
  PRESETS.map((p, i) => ({ value: String(i), text: p.label })),
);
presetRow.append(makeLabel("Preset:"), presetSelect);

// Row 4: Mode selector + Next button (Geiss only)
const modeRow = makeRow();
modeRow.id = "mode-row";
modeRow.style.display = "none";
const modeSelect = makeSelect(
  "mode-select",
  Array.from({ length: 9 }, (_, i) => ({ value: String(i + 1), text: String(i + 1) })),
);
const nextModeBtn = document.createElement("button");
nextModeBtn.id = "next-mode-btn";
nextModeBtn.style.cssText = CTRL_SMALL_BTN_STYLE;
nextModeBtn.textContent = "Next";

// Auto-cycle checkbox
const autoModeLabel = document.createElement("label");
autoModeLabel.style.cssText = "color:rgba(255,255,255,0.5);font-size:12px;display:flex;align-items:center;gap:4px;cursor:pointer;";
const autoModeCheckbox = document.createElement("input");
autoModeCheckbox.type = "checkbox";
autoModeCheckbox.id = "auto-mode-checkbox";
autoModeCheckbox.checked = true;
autoModeCheckbox.style.cursor = "pointer";
autoModeLabel.append(autoModeCheckbox, document.createTextNode("Auto-cycle"));

// Auto-cycle interval input (seconds)
const autoCycleInput = document.createElement("input");
autoCycleInput.type = "number";
autoCycleInput.id = "auto-cycle-input";
autoCycleInput.value = "30";
autoCycleInput.min = "1";
autoCycleInput.max = "600";
autoCycleInput.step = "5";
autoCycleInput.style.cssText = "width:50px;background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.2);color:#fff;padding:2px 4px;border-radius:4px;font-size:12px;";
const autoCycleLabel = document.createElement("label");
autoCycleLabel.style.cssText = "color:rgba(255,255,255,0.5);font-size:12px;display:flex;align-items:center;gap:4px;";
autoCycleLabel.append(document.createTextNode("every"), autoCycleInput, document.createTextNode("s"));

// Resolution selector (Geiss internal render resolution)
const geissResSelect = makeSelect("geiss-res-select", [
  { value: "640x480", text: "640x480" },
  { value: "960x720", text: "960x720" },
  { value: "1280x960", text: "1280x960" },
  { value: "dynamic", text: "Dynamic (viewport)" },
]);
geissResSelect.value = "960x720";

// Retina checkbox (multiply resolution by devicePixelRatio)
const retinaLabel = document.createElement("label");
retinaLabel.style.cssText = "color:rgba(255,255,255,0.5);font-size:12px;display:flex;align-items:center;gap:4px;cursor:pointer;";
const retinaCheckbox = document.createElement("input");
retinaCheckbox.type = "checkbox";
retinaCheckbox.id = "retina-checkbox";
retinaCheckbox.checked = false;
retinaCheckbox.style.cursor = "pointer";
retinaLabel.append(retinaCheckbox, document.createTextNode("Retina"));

/** Creates a labeled checkbox for toggling Geiss effects. */
function makeEffectCheckbox(id: string, label: string): { checkbox: HTMLInputElement; label: HTMLLabelElement } {
  const lbl = document.createElement("label");
  lbl.style.cssText = "color:rgba(255,255,255,0.5);font-size:12px;display:flex;align-items:center;gap:4px;cursor:pointer;";
  const cb = document.createElement("input");
  cb.type = "checkbox";
  cb.id = id;
  cb.checked = false;
  cb.style.cursor = "pointer";
  lbl.append(cb, document.createTextNode(label));
  return { checkbox: cb, label: lbl };
}

// Effect checkboxes
const shadeBobsCb = makeEffectCheckbox("effect-shadebobs", "Blobs");
const chasersCb = makeEffectCheckbox("effect-chasers", "Chasers");
const gridCb = makeEffectCheckbox("effect-grid", "Grid");

modeRow.append(
  makeLabel("Mode:"), modeSelect, nextModeBtn, autoModeLabel, autoCycleLabel,
  makeLabel("Res:"), geissResSelect, retinaLabel,
  shadeBobsCb.label, chasersCb.label, gridCb.label,
);

controls.append(playRow, pipelineRow, presetRow, modeRow);
document.body.appendChild(controls);

// --- Web Audio chain ---------------------------------------------------------

const ctx = new AudioContext();
const source = ctx.createMediaElementSource(audio);
const analyser = ctx.createAnalyser();
analyser.fftSize = 512;
analyser.smoothingTimeConstant = 0.8;
source.connect(analyser);
analyser.connect(ctx.destination);

// --- Visualizer state --------------------------------------------------------

let viz: BergiumVisualizer;
let currentPipeline: "milkdrop" | "geiss" = "milkdrop";
let currentPresetIdx = 0;

const W = canvas.width = window.innerWidth;
const H = canvas.height = window.innerHeight;

/** Compute Geiss internal resolution from the selector + retina checkbox. */
function getGeissRes(): [number, number] {
  const val = geissResSelect.value;
  let w: number, h: number;
  if (val === "dynamic") {
    w = window.innerWidth;
    h = window.innerHeight;
  } else {
    const [pw, ph] = val.split("x").map(Number);
    w = pw || 960;
    h = ph || 720;
  }
  // Retina: multiply by device pixel ratio for sharper rendering on high-DPI
  if (retinaCheckbox.checked) {
    const dpr = window.devicePixelRatio || 1;
    w = Math.round(w * dpr);
    h = Math.round(h * dpr);
  }
  return [w, h];
}

function createViz(pipeline: "milkdrop" | "geiss"): BergiumVisualizer {
  const [gw, gh] = pipeline === "geiss" ? getGeissRes() : [W, H];
  const vizOptions: VisualizerOptions = {
    width: gw,
    height: gh,
    pipeline,
  };
  const v = createVisualizer(
    ctx as unknown as AudioContext,
    canvas,
    vizOptions,
  );
  v.connectAudio(analyser as unknown as AudioNode);
  return v;
}

viz = createViz("milkdrop");
viz.loadPreset(PRESETS[0].preset as Parameters<typeof viz.loadPreset>[0], 0.5);

function loadCurrentPreset(): void {
  if (currentPipeline !== "milkdrop") return;
  const { preset } = PRESETS[currentPresetIdx];
  viz.loadPreset(preset as Parameters<typeof viz.loadPreset>[0], 0.5);
}

// --- Event handlers -----------------------------------------------------------

playBtn.addEventListener("click", async () => {
  if (audio.paused) {
    await ctx.resume();
    audio.play();
    playBtn.textContent = "⏸ Pause";
    showTrackTitle();
  } else {
    audio.pause();
    playBtn.textContent = "▶ Play";
  }
});

presetSelect.addEventListener("change", () => {
  currentPresetIdx = parseInt(presetSelect.value, 10);
  loadCurrentPreset();
});

pipelineSelect.addEventListener("change", () => {
  const pipeline = pipelineSelect.value as "milkdrop" | "geiss";
  if (pipeline === currentPipeline) return;

  // Destroy old visualizer
  viz.destroy();

  // Switch pipeline
  currentPipeline = pipeline;
  viz = createViz(pipeline);

  // Update UI
  if (pipeline === "milkdrop") {
    statusLabel.textContent = "Milkdrop";
    presetRow.style.display = "flex";
    modeRow.style.display = "none";
    loadCurrentPreset();
  } else {
    statusLabel.textContent = "Geiss";
    presetRow.style.display = "none";
    modeRow.style.display = "flex";
    // Set initial Geiss mode + sync auto-cycle checkbox
    if (viz instanceof GeissAdapter) {
      viz.setMode(parseInt(modeSelect.value, 10));
      autoModeCheckbox.checked = viz.getAutoMode();
      viz.setAutoCycleSeconds(parseInt(autoCycleInput.value, 10) || 30);
    }
  }
});

modeSelect.addEventListener("change", () => {
  if (currentPipeline !== "geiss") return;
  if (viz instanceof GeissAdapter) {
    viz.setMode(parseInt(modeSelect.value, 10));
  }
});

nextModeBtn.addEventListener("click", () => {
  if (currentPipeline !== "geiss") return;
  if (viz instanceof GeissAdapter) {
    viz.nextMode();
    modeSelect.value = String(viz.getMode());
  }
});

autoModeCheckbox.addEventListener("change", () => {
  if (currentPipeline !== "geiss") return;
  if (viz instanceof GeissAdapter) {
    viz.setAutoMode(autoModeCheckbox.checked);
  }
});

autoCycleInput.addEventListener("change", () => {
  if (currentPipeline !== "geiss") return;
  if (viz instanceof GeissAdapter) {
    viz.setAutoCycleSeconds(parseInt(autoCycleInput.value, 10) || 30);
  }
});

function recreateGeissViz(): void {
  if (currentPipeline !== "geiss") return;
  const prevMode = viz instanceof GeissAdapter ? viz.getMode() : 1;
  const prevAuto = viz instanceof GeissAdapter ? viz.getAutoMode() : true;
  const prevCycle = viz instanceof GeissAdapter ? viz.getAutoCycleSeconds() : 30;
  viz.destroy();
  viz = createViz("geiss");
  if (viz instanceof GeissAdapter) {
    viz.setMode(prevMode);
    viz.setAutoMode(prevAuto);
    viz.setAutoCycleSeconds(prevCycle);
    modeSelect.value = String(prevMode);
  }
}

geissResSelect.addEventListener("change", recreateGeissViz);
retinaCheckbox.addEventListener("change", recreateGeissViz);

// Effect checkbox handlers
shadeBobsCb.checkbox.addEventListener("change", () => {
  if (viz instanceof GeissAdapter) viz.setEffect("shadeBobs", shadeBobsCb.checkbox.checked);
});
chasersCb.checkbox.addEventListener("change", () => {
  if (viz instanceof GeissAdapter) viz.setEffect("chasers", chasersCb.checkbox.checked);
});
gridCb.checkbox.addEventListener("change", () => {
  if (viz instanceof GeissAdapter) viz.setEffect("grid", gridCb.checkbox.checked);
});

// --- Render loop -------------------------------------------------------------

function loop(): void {
  viz.render();
  // Sync modeSelect when auto-cycling changes the Geiss mode
  if (currentPipeline === "geiss" && viz instanceof GeissAdapter) {
    const m = String(viz.getMode());
    if (modeSelect.value !== m) modeSelect.value = m;
  }
  requestAnimationFrame(loop);
}

loop();

window.addEventListener("resize", () => {
  const w = window.innerWidth;
  const h = window.innerHeight;
  canvas.width = w;
  canvas.height = h;
  viz.setRendererSize(w, h);
});

console.log("[Bergium Demo] Initialized - click Play and choose a pipeline/preset.");
