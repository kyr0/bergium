import type { LegacyMilkDropPreset } from "../../presets/types.js";
import type { RenderSize, RenderTarget } from "../../graphics/types.js";
import type { RendererPipeline, RenderFrame, SimulationFrame } from "../types.js";

/**
 * The Webamp-compatible method surface of a pinned Butterchurn Visualizer. The
 * adapter delegates to it; the library never imports Butterchurn directly (it is a
 * dev/runtime-injected frozen reference until the TypeScript port replaces it).
 *
 * Phase 2: `render(target?)` forwards the Compositor's RenderTarget so the
 * butterchurn renders directly into the target framebuffer instead of its own
 * canvas. The optional parameter is backward-compatible with callers that don't
 * supply a target.
 */
export interface ButterchurnVisualizerHandle {
  loadPreset(preset: LegacyMilkDropPreset, transitionSeconds: number): void;
  connectAudio(node: AudioNode): void;
  setRendererSize(width: number, height: number): void;
  launchSongTitleAnim(title: string): void;
  render(target?: RenderTarget | null): void;
}

/**
 * Phase 1 adapter: wraps a pinned Butterchurn Visualizer behind the pipeline
 * contract. Phase 2: `render(target)` forwards the Compositor's RenderTarget
 * so the butterchurn renders directly into the target framebuffer instead of
 * its own canvas.
 */
export class MilkdropPipeline implements RendererPipeline<LegacyMilkDropPreset> {
  public readonly id = "milkdrop";

  public constructor(private readonly visualizer: ButterchurnVisualizerHandle) {}

  public loadPreset(preset: LegacyMilkDropPreset, transitionSeconds: number): void {
    this.visualizer.loadPreset(preset, transitionSeconds);
  }

  /** Connect a host audio node; Butterchurn taps it with its own analyser. */
  public connectAudio(node: AudioNode): void {
    this.visualizer.connectAudio(node);
  }

  public resize(size: RenderSize): void {
    this.visualizer.setRendererSize(size.width, size.height);
  }

  public simulate(_frame: SimulationFrame): void {
    // Butterchurn advances simulation inside render(); the fixed-step clock is the
    // Geiss pipeline's concern. Kept as a no-op seam for the adapter.
  }

  public render(_frame: RenderFrame, target: RenderTarget): void {
    // Phase 2: render directly to the Compositor's RenderTarget.
    this.visualizer.render(target);
  }

  public destroy(): void {
    // The Visualizer lifecycle is owned by the host/injector.
  }
}
