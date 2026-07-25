import type {
  CanvasLike,
  BergiumVisualizer,
  RenderFrameOptions,
  TextOptions,
  VisualizerOptions,
} from "../api/types.js";
import type { Preset } from "../presets/types.js";

/**
 * Orchestrator only. Implementation order per frame:
 * sample audio -> advance fixed simulation -> render pipeline target(s)
 * -> compose/text -> present.
 */
export class VisualizerRuntime implements BergiumVisualizer {
  public constructor(
    private readonly audioContext: AudioContext,
    private readonly canvas: CanvasLike,
    private readonly options: VisualizerOptions,
  ) {
    void this.audioContext;
    void this.canvas;
    void this.options;
  }

  public connectAudio(_node: AudioNode): void {
    throw new Error("Scaffold only: delegate to AudioEngine.");
  }

  public disconnectAudio(): void { }

  public loadPreset(_preset: Preset, _transitionSeconds: number): void {
    throw new Error("Scaffold only: validate, dispatch, and schedule transition.");
  }

  public setRendererSize(_width: number, _height: number): void { }

  public launchSongTitleAnim(title: string): void {
    this.setText({ text: title, layer: "overlay", durationSeconds: 1.7 });
  }

  public setText(_options: TextOptions): void { }

  public render(): void {
    this.renderFrame({ timestampSeconds: this.audioContext.currentTime });
  }

  public renderFrame(_options: RenderFrameOptions): void {
    throw new Error("Scaffold only: execute the fixed-step render orchestration.");
  }

  public destroy(): void { }
}

