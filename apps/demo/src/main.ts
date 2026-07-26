/**
 * Bergium Demo - dual-pipeline visualizer (Geiss + Milkdrop) on one canvas.
 *
 * Now a thin consumer of bergium-core's high-level `createBergiumPlayer` API: all
 * preset/profile/shader/cycling complexity lives inside the engine. The demo only
 * owns the audio element + AudioContext, wires the analyser into the player, and
 * exposes a small control surface (play, pipeline toggle, preset picker, Geiss
 * effect toggles). Clicking the canvas also toggles Geiss/Milkdrop.
 */

import {
  createBergiumPlayer,
  getBuiltinPresets,
  type BergiumPlayer,
} from "bergium-core";

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

/** Advance to the next track and play it. */
function playNextTrack(): void {
  trackIdx = (trackIdx + 1) % PLAYLIST.length;
  audio.src = PLAYLIST[trackIdx]!;
  trackLabel.textContent = trackName(PLAYLIST[trackIdx]!);
  audio.play();
  showTrackTitle();
}

/** Show the current song title on the visualizer (pipeline-agnostic). */
function showTrackTitle(): void {
  player.launchSongTitleAnim(trackName(PLAYLIST[trackIdx]!));
}

// Auto-advance to next track when current one ends
audio.addEventListener("ended", playNextTrack);

// --- Controls UI (DOM API - avoids innerHTML HTML-parsing edge cases) ---------

/** Shared style constants for consistent look across all controls. */
const CTRL_BTN_STYLE = "background:rgba(255,255,255,0.15);border:1px solid rgba(255,255,255,0.3);color:#fff;padding:8px 16px;border-radius:4px;cursor:pointer;font-size:13px;";
const CTRL_SELECT_STYLE = "background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.2);color:#fff;padding:4px 8px;border-radius:4px;font-size:12px;cursor:pointer;";
const CTRL_LABEL_STYLE = "color:rgba(255,255,255,0.5);font-size:12px;";

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

/** Creates a <select> with shared styling. */
function makeSelect(id: string): HTMLSelectElement {
  const select = document.createElement("select");
  select.id = id;
  select.style.cssText = CTRL_SELECT_STYLE;
  return select;
}

const controls = document.createElement("div");
controls.style.cssText = "position:fixed;top:16px;left:16px;z-index:10;display:flex;flex-direction:column;gap:10px;align-items:flex-start;font-family:sans-serif;background:rgba(0,0,0,0.5);padding:12px 16px;border-radius:8px;backdrop-filter:blur(8px);";

// Row 1: Play + status + track label
const playRow = makeRow();
const playBtn = document.createElement("button");
playBtn.id = "play-btn";
playBtn.style.cssText = CTRL_BTN_STYLE;
playBtn.textContent = "▶ Play";
const statusLabel = document.createElement("span");
statusLabel.style.cssText = "color:rgba(255,255,255,0.5);font-size:12px;font-family:monospace;";
statusLabel.textContent = "Milkdrop";
const trackLabel = document.createElement("span");
trackLabel.style.cssText = "color:rgba(255,255,255,0.7);font-size:12px;font-family:monospace;max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";
trackLabel.textContent = trackName(PLAYLIST[0]!);
playRow.append(playBtn, statusLabel, trackLabel);

// Row 2: Pipeline toggle (Geiss/Milkdrop) + preset picker (Milkdrop)
const toggleRow = makeRow();
const toggleBtn = document.createElement("button");
toggleBtn.id = "pipeline-toggle";
toggleBtn.style.cssText = CTRL_BTN_STYLE;
toggleBtn.textContent = "⇄ Toggle Geiss/Milkdrop";
const presetSelect = makeSelect("preset-select");
toggleRow.append(toggleBtn, makeLabel("Preset:"), presetSelect);

// Row 3: Geiss effect toggles
const effectsRow = makeRow();

/** Creates a labeled checkbox for toggling a Geiss effect. */
function makeEffectCheckbox(
  id: string,
  label: string,
  checked: boolean,
): { checkbox: HTMLInputElement; label: HTMLLabelElement } {
  const lbl = document.createElement("label");
  lbl.style.cssText = "color:rgba(255,255,255,0.5);font-size:12px;display:flex;align-items:center;gap:4px;cursor:pointer;";
  const cb = document.createElement("input");
  cb.type = "checkbox";
  cb.id = id;
  cb.checked = checked;
  cb.style.cursor = "pointer";
  lbl.append(cb, document.createTextNode(label));
  return { checkbox: cb, label: lbl };
}

const chasersCb = makeEffectCheckbox("effect-chasers", "Chasers", true);
const shadeBobsCb = makeEffectCheckbox("effect-shadebobs", "Blobs", false);
const gridCb = makeEffectCheckbox("effect-grid", "Grid", false);
effectsRow.append(chasersCb.label, shadeBobsCb.label, gridCb.label);

controls.append(playRow, toggleRow, effectsRow);
document.body.appendChild(controls);

// --- Web Audio chain ---------------------------------------------------------

const ctx = new AudioContext();
const source = ctx.createMediaElementSource(audio);
const analyser = ctx.createAnalyser();
analyser.fftSize = 512;
analyser.smoothingTimeConstant = 0.8;
source.connect(analyser);
analyser.connect(ctx.destination);

// --- Bergium player (the engine owns presets, cycling, effects, toggling) ----

const player: BergiumPlayer = createBergiumPlayer(ctx as unknown as AudioContext, canvas, {
  width: window.innerWidth,
  height: window.innerHeight,
  initialPipeline: "milkdrop",
  // autoRender defaults to true — the player runs its own RAF loop.
  geiss: { effects: { chasers: true } },
  milkdrop: { cycleSeconds: 30 },
});
player.connectAudio(analyser as unknown as AudioNode);

// --- Event handlers ----------------------------------------------------------

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

toggleBtn.addEventListener("click", () => {
  player.togglePipeline();
  statusLabel.textContent = player.getPipeline() === "geiss" ? "Geiss" : "Milkdrop";
});

presetSelect.addEventListener("change", async () => {
  // User selected a preset manually — load it (also resets the 30s cycle).
  const presets = await getBuiltinPresets();
  const idx = parseInt(presetSelect.value, 10);
  const entry = presets[idx];
  if (entry) {
    player.loadPreset(entry.preset, 0.5);
  }
});

// Effect checkbox handlers
chasersCb.checkbox.addEventListener("change", () => {
  player.setGeissEffect("chasers", chasersCb.checkbox.checked);
});
shadeBobsCb.checkbox.addEventListener("change", () => {
  player.setGeissEffect("shadeBobs", shadeBobsCb.checkbox.checked);
});
gridCb.checkbox.addEventListener("change", () => {
  player.setGeissEffect("grid", gridCb.checkbox.checked);
});

// --- Populate the preset picker from the built-in registry -------------------

/** Populate the preset <select> with all built-in presets (async). */
async function populatePresets(): Promise<void> {
  const presets = await getBuiltinPresets();
  for (let i = 0; i < presets.length; i++) {
    const option = document.createElement("option");
    option.value = String(i);
    option.textContent = presets[i]!.name;
    presetSelect.appendChild(option);
  }
}

void populatePresets();

// --- Resize handling ---------------------------------------------------------

window.addEventListener("resize", () => {
  const w = window.innerWidth;
  const h = window.innerHeight;
  canvas.width = w;
  canvas.height = h;
  player.setRendererSize(w, h);
});

console.log("[Bergium Demo] Initialized - click Play; click the canvas or the toggle to switch Geiss/Milkdrop.");
