/**
 * Built-in preset registry for bergium-core.
 *
 * Consolidates everything a consumer previously had to assemble by hand:
 * the bergium Blank preset, hand-authored bergium presets, and the full
 * `butterchurn-presets` library (with known-broken entries filtered out).
 *
 * `butterchurn-presets` is loaded lazily so engines without it still get the
 * bergium-authored presets.
 */
import BlankPreset from "../../pipelines/milkdrop/port/blankPreset.js";
import { CUSTOM_PRESETS, type BuiltinPresetEntry } from "./customPresets.js";
import { DISABLED_PRESET_NAMES } from "./disabled.js";

export { CUSTOM_PRESETS } from "./customPresets.js";
export { DISABLED_PRESET_NAMES } from "./disabled.js";
export type { BuiltinPresetEntry } from "./customPresets.js";

/**
 * Resolve the full built-in preset list, sorted for stable display.
 *
 * Order: Blank, then bergium-authored presets, then every non-disabled preset
 * from `butterchurn-presets` (alphabetical). Never throws — if the optional
 * `butterchurn-presets` dependency is missing, only the bergium presets are
 * returned.
 */
export async function getBuiltinPresets(): Promise<BuiltinPresetEntry[]> {
  const entries: BuiltinPresetEntry[] = [
    { name: "Bergium Blank", preset: BlankPreset },
    ...CUSTOM_PRESETS,
  ];

  try {
    const mod = await import("butterchurn-presets");
    // CJS UMD: prefer `.default`, fall back to the module namespace itself.
    const lib = mod.default ?? mod;
    if (typeof lib.getPresets === "function") {
      const all = lib.getPresets();
      for (const name of Object.keys(all).sort()) {
        if (DISABLED_PRESET_NAMES.has(name)) continue;
        const preset = all[name];
        if (preset !== undefined) entries.push({ name, preset });
      }
    }
  } catch (err) {
    // Optional dependency: degrade gracefully.
    console.warn(
      "[bergium] butterchurn-presets unavailable; using bergium presets only:",
      err,
    );
  }

  return entries;
}
