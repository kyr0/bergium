export type LegacyMilkDropPreset = Record<string, unknown>;

interface BasePreset { $schema?: string; format: "bergium"; version: 1; name: string; simulation: { hz: number; seed: number }; }

/** Classic exposes source choices, not a free-form approximation of their math. */
export interface GeissClassicPreset extends BasePreset {
  pipeline: "geiss-classic";
  profile: "geiss-4.30-plugin-8bit" | "geiss-4.30-plugin-truecolor";
  mode: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18 | 19 | 20 | 21 | 22 | 23 | 24 | 25 | "random";
  options?: { modeFramesAt30Hz?: number; beatDetection?: boolean; slideShift?: boolean; syncColorToSound?: boolean; };
}

export interface Geiss3dPreset extends BasePreset {
  pipeline: "geiss-3d";
  feedback: { decay: number; format: "intensity8" | "rgba8" };
  warp: { kind: "zoom" | "rotate" | "vortex" | "ripple" | "perspective"; strength: number };
  waveforms?: readonly { kind: "line" | "dots" | "spectrum"; layer: "pre-warp" | "post-warp"; }[];
  particles?: readonly { kind: "solar" | "chaser" | "point"; layer: "pre-warp" | "post-warp"; count: number; }[];
  post?: { palette?: string; gamma?: number }; text?: { layer: "feedback" | "overlay" };
}

export type BergiumPreset = GeissClassicPreset | Geiss3dPreset;
export type Preset = LegacyMilkDropPreset | BergiumPreset;
export function isBergiumPreset(preset: Preset): preset is BergiumPreset { return preset.format === "bergium" && preset.version === 1; }

