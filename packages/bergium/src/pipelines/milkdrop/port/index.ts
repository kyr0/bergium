/**
 * Butterchurn MilkDrop TypeScript port - public entry point.
 *
 * Exposes the `createButterchurnVisualizer` factory (matching the vendor's
 * `Butterchurn.createVisualizer` API surface) so that existing hosts (Webamp,
 * etc.) can drop in the in-tree port without changing call sites.
 *
 * The factory returns a `Butterchurn` instance, which implements
 * `MilkdropPipeline.ButterchurnVisualizerHandle`.
 */
import Butterchurn from "./butterchurn.js";
import type { CanvasLike } from "../../../api/types.js";
import type { LegacyMilkDropPreset } from "../../../presets/types.js";
import type { ButterchurnVisualizerHandle } from "../MilkdropPipeline.js";

export interface ButterchurnOptions {
  width?: number;
  height?: number;
  pixelRatio?: number;
  meshWidth?: number;
  meshHeight?: number;
  textureRatio?: number;
  outputFXAA?: boolean;
  deterministic?: boolean;
  testMode?: boolean;
  onlyUseWASM?: boolean;
}

/**
 * Create a Butterchurn MilkDrop visualizer instance (matches vendor API).
 *
 * @param audioContext - Web Audio context
 * @param canvas      - Output 2D canvas
 * @param opts        - Optional settings
 * @returns A Butterchurn instance that implements ButterchurnVisualizerHandle
 */
export function createButterchurnVisualizer(
  audioContext: AudioContext,
  canvas: CanvasLike,
  opts: ButterchurnOptions = {}
): ButterchurnVisualizerHandle {
  return new Butterchurn(audioContext, canvas, opts) as unknown as ButterchurnVisualizerHandle;
}

// Re-export the Butterchurn class for direct instantiation if needed
export { Butterchurn };
export type { Butterchurn as ButterchurnClass };
