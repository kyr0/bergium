import type { CanvasLike, BergiumVisualizer, VisualizerOptions } from "./types.js";
import Butterchurn from "../pipelines/milkdrop/port/butterchurn.js";
import { GeissAdapter } from "../adapters/GeissAdapter.js";

/**
 * Factory for creating a Bergium visualizer instance.
 *
 * pipeline "milkdrop" => Butterchurn (TypeScript-native butterchurn port)
 * pipeline "geiss"    => GeissAdapter (GPU frame graph with mode cycling)
 * default             => GeissAdapter (geiss)
 */
export function createVisualizer(
  audioContext: AudioContext,
  canvas: CanvasLike,
  options: VisualizerOptions,
): BergiumVisualizer {
  const pipeline = options.pipeline ?? "geiss";
  if (pipeline === "milkdrop") {
    // Map VisualizerOptions to ButterchurnOpts (subset of fields)
    const butterchurnOpts = {
      width: options.width ?? 1200,
      height: options.height ?? 900,
      pixelRatio: options.pixelRatio ?? 1,
      meshWidth: options.meshWidth ?? 48,
      meshHeight: options.meshHeight ?? 36,
      textureRatio: 1,
      outputFXAA: options.outputFXAA ?? false,
      deterministic: options.deterministic ?? false,
      onlyUseWASM: options.onlyUseWASM ?? false,
    };
    return new Butterchurn(audioContext, canvas, butterchurnOpts) as unknown as BergiumVisualizer;
  }
  // Geiss pipeline: GeissAdapter uses width/height
  return new GeissAdapter(audioContext, canvas, {
    width: options.width ?? 320,
    height: options.height ?? 240,
    pixelRatio: options.pixelRatio ?? 1,
    meshWidth: options.meshWidth ?? 48,
    meshHeight: options.meshHeight ?? 36,
    simulationHz: options.simulationHz ?? 30,
    preferredAudioTransport: options.preferredAudioTransport ?? "auto",
    outputFXAA: options.outputFXAA ?? false,
    deterministic: options.deterministic ?? false,
    onlyUseWASM: options.onlyUseWASM ?? false,
    pipeline,
  });
}

