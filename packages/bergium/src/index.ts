export { createVisualizer } from "./api/createVisualizer.js";
export type {
  CanvasLike,
  BergiumVisualizer,
  RenderFrameOptions,
  TextOptions,
  VisualizerOptions,
} from "./api/types.js";
export type { AudioFrame, AudioFrameProvider } from "./audio/types.js";
export type { BergiumPreset, LegacyMilkDropPreset, Preset } from "./presets/types.js";
export type { RendererPipeline } from "./pipelines/types.js";
export { default as BlankPreset } from "./pipelines/milkdrop/port/blankPreset.js";
export { GeissAdapter } from "./adapters/GeissAdapter.js";

// --- High-level dual-pipeline player (Geiss + Milkdrop on one canvas) ----------
export { createBergiumPlayer, BergiumPlayer } from "./api/BergiumPlayer.js";
export type {
  BergiumPipeline,
  BergiumPlayerOptions,
  BergiumPlayerGeissOptions,
  BergiumPlayerMilkdropOptions,
} from "./api/BergiumPlayer.js";

// --- Built-in preset registry (bergium presets + butterchurn-presets) ----------
export { getBuiltinPresets, CUSTOM_PRESETS, DISABLED_PRESET_NAMES } from "./presets/builtin/index.js";
export type { BuiltinPresetEntry } from "./presets/builtin/index.js";

