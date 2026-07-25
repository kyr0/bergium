import type { AudioFrame } from "../audio/types.js";
import type { Preset } from "../presets/types.js";

export type CanvasLike = HTMLCanvasElement | OffscreenCanvas;

export interface VisualizerOptions {
  width: number;
  height: number;
  pixelRatio?: number;
  meshWidth?: number;
  meshHeight?: number;
  /** Which render pipeline to use. Default: "geiss". */
  pipeline?: "geiss" | "milkdrop";
  /** MilkDrop-only: force WASM equations (frozen-asset path, non-goal). */
  onlyUseWASM?: boolean;
  preferredAudioTransport?: "auto" | "worklet-sab" | "worklet-message" | "analyser";
  simulationHz?: number;
  /** MilkDrop-only: FXAA on the output pass. */
  outputFXAA?: boolean;
  /** MilkDrop-only: render deterministically. */
  deterministic?: boolean;
}

export interface RenderFrameOptions {
  timestampSeconds: number;
  audioFrame?: AudioFrame;
}

export interface TextOptions {
  text: string;
  layer?: "feedback" | "overlay";
  durationSeconds?: number;
  font?: string;
}

/** Butterchurn-compatible methods stay mandatory; extensions are additive. */
export interface BergiumVisualizer {
  connectAudio(node: AudioNode): void;
  disconnectAudio(): void;
  loadPreset(preset: Preset, transitionSeconds: number): void;
  setRendererSize(width: number, height: number): void;
  launchSongTitleAnim(title: string): void;
  setText(options: TextOptions): void;
  render(): void;
  renderFrame(options: RenderFrameOptions): void;
  destroy(): void;
}

