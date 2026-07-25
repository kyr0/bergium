import type { AudioFrame } from "../audio/types.js";
import type { RenderSize, RenderTarget } from "../graphics/types.js";

export interface SimulationFrame {
  step: number;
  timeSeconds: number;
  deltaSeconds: number;
  audio: AudioFrame;
}

export interface RenderFrame {
  presentationTimeSeconds: number;
  interpolation: number;
  audio: AudioFrame;
}

export interface RendererPipeline<Preset = unknown> {
  readonly id: string;
  loadPreset(preset: Preset, transitionSeconds: number): void;
  resize(size: RenderSize): void;
  simulate(frame: SimulationFrame): void;
  render(frame: RenderFrame, target: RenderTarget): void;
  destroy(): void;
}

