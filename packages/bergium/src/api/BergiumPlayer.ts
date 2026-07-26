/**
 * BergiumPlayer - the high-level, dual-pipeline visualizer.
 *
 * Exists so demos and integrations (Webamp) need only a handful of calls instead of
 * hand-wiring presets, shaders, profiles, mode/effect/cycling timers and pipeline
 * swapping. It owns ONE canvas and drives the active bergium pipeline (Geiss or
 * Milkdrop), toggling between them on click — mirroring the pipeline `<select>` in
 * the original standalone demo (destroy + recreate).
 *
 * It deliberately implements the small surface Webamp drives a butterchurn visualizer
 * with (`connectAudio`, `loadPreset`, `setRendererSize`, `launchSongTitleAnim`,
 * `render`), so it can be injected straight into Webamp's `importButterchurn`.
 */
import { createVisualizer } from "./createVisualizer.js";
import { GeissAdapter } from "../adapters/GeissAdapter.js";
import type { BergiumVisualizer, CanvasLike } from "./types.js";
import type { Preset } from "../presets/types.js";
import {
  getBuiltinPresets,
  type BuiltinPresetEntry,
} from "../presets/builtin/index.js";

/** Active renderer pipeline. */
export type BergiumPipeline = "geiss" | "milkdrop";

/** Geiss-specific defaults applied by the player. */
export interface BergiumPlayerGeissOptions {
  /** Auto-cycle Geiss modes. Default: true. */
  autoMode?: boolean;
  /** Seconds between automatic Geiss mode switches. Default: 30. */
  cycleSeconds?: number;
  /** Effect toggles. Default: chasers enabled. */
  effects?: { chasers?: boolean; shadeBobs?: boolean; grid?: boolean };
}

/** Milkdrop-specific defaults applied by the player. */
export interface BergiumPlayerMilkdropOptions {
  /** Seconds between automatic preset switches. Default: 30 (0 disables). */
  cycleSeconds?: number;
  /** Zero-based preset to load first. Default: 0. */
  initialPresetIndex?: number;
  /** Preset source. Default: bergium's built-in registry. */
  getPresets?: () => Promise<BuiltinPresetEntry[]>;
  /**
   * Whether the player immediately loads the initial preset itself.
   * Default: true. Set false when an external driver (e.g. Webamp) owns the
   * initial preset selection but the player should still auto-cycle.
   */
  autoLoadInitial?: boolean;
}

export interface BergiumPlayerOptions {
  width?: number;
  height?: number;
  /** Pipeline to start on. Default: "milkdrop". */
  initialPipeline?: BergiumPipeline;
  /** Run an internal requestAnimationFrame loop. Default: true. */
  autoRender?: boolean;
  /** Clicking the canvas toggles Geiss/Milkdrop. Default: true. */
  canvasClickToggles?: boolean;
  geiss?: BergiumPlayerGeissOptions;
  milkdrop?: BergiumPlayerMilkdropOptions;
}

/** Default seconds for Geiss mode + Milkdrop preset auto-cycling. */
const DEFAULT_CYCLE_SECONDS = 30;

const viewportWidth = (): number =>
  typeof window !== "undefined" ? window.innerWidth : 1280;
const viewportHeight = (): number =>
  typeof window !== "undefined" ? window.innerHeight : 720;

export class BergiumPlayer {
  private readonly ctx: AudioContext;
  private readonly canvas: CanvasLike;

  private width: number;
  private height: number;

  // Resolved option snapshots.
  private readonly geissAutoMode: boolean;
  private readonly geissCycleSeconds: number;
  private readonly geissEffects: { chasers: boolean; shadeBobs: boolean; grid: boolean };
  private readonly milkdropCycleSeconds: number;
  private readonly milkdropInitialPresetIndex: number;
  private readonly milkdropGetPresets: () => Promise<BuiltinPresetEntry[]>;
  private readonly milkdropAutoLoadInitial: boolean;

  /** Active visualizer instance (Geiss or Milkdrop). */
  private viz: BergiumVisualizer;
  private pipeline: BergiumPipeline;

  private analyser: AudioNode | null = null;

  private presets: BuiltinPresetEntry[] = [];
  private presetIndex = 0;
  private currentPreset: unknown = null;
  private presetTimer: ReturnType<typeof setInterval> | null = null;

  private rafHandle: number | null = null;
  private readonly clickHandler: (() => void) | null = null;

  public constructor(ctx: AudioContext, canvas: CanvasLike, options: BergiumPlayerOptions = {}) {
    this.ctx = ctx;
    this.canvas = canvas;
    this.width = options.width ?? viewportWidth();
    this.height = options.height ?? viewportHeight();

    const geiss = options.geiss ?? {};
    this.geissAutoMode = geiss.autoMode ?? true;
    this.geissCycleSeconds = geiss.cycleSeconds ?? DEFAULT_CYCLE_SECONDS;
    this.geissEffects = {
      chasers: geiss.effects?.chasers ?? true,
      shadeBobs: geiss.effects?.shadeBobs ?? false,
      grid: geiss.effects?.grid ?? false,
    };

    const milkdrop = options.milkdrop ?? {};
    this.milkdropCycleSeconds = milkdrop.cycleSeconds ?? DEFAULT_CYCLE_SECONDS;
    this.milkdropInitialPresetIndex = milkdrop.initialPresetIndex ?? 0;
    this.milkdropGetPresets = milkdrop.getPresets ?? getBuiltinPresets;
    this.milkdropAutoLoadInitial = milkdrop.autoLoadInitial ?? true;

    this.pipeline = options.initialPipeline ?? "milkdrop";
    this.viz = this.createViz(this.pipeline);

    // Click toggles the pipeline (mirrors the demo's pipeline <select>).
    if ((options.canvasClickToggles ?? true) && typeof (canvas as EventTarget).addEventListener === "function") {
      this.clickHandler = (): void => this.togglePipeline();
      (canvas as EventTarget).addEventListener("click", this.clickHandler);
    }

    if (this.pipeline === "milkdrop") {
      // Fire-and-forget: populates the preset list and (optionally) loads preset 0.
      void this.initMilkdrop();
    }

    if (options.autoRender ?? true) {
      this.start();
    }
  }

  // --- Visualizer factory + pipeline switching --------------------------------

  /** Create a bergium pipeline instance on the shared canvas, applying defaults. */
  private createViz(pipeline: BergiumPipeline): BergiumVisualizer {
    const viz = createVisualizer(this.ctx, this.canvas, {
      pipeline,
      width: this.width,
      height: this.height,
      // Webamp hardcodes onlyUseWASM:true; bergium's active path is JS presets.
      onlyUseWASM: false,
    });

    if (pipeline === "geiss" && viz instanceof GeissAdapter) {
      viz.setAutoMode(this.geissAutoMode);
      viz.setAutoCycleSeconds(this.geissCycleSeconds);
      viz.setEffect("chasers", this.geissEffects.chasers);
      viz.setEffect("shadeBobs", this.geissEffects.shadeBobs);
      viz.setEffect("grid", this.geissEffects.grid);
    }

    if (this.analyser !== null) {
      viz.connectAudio(this.analyser);
    }
    return viz;
  }

  /** Switch to an explicit pipeline (no-op if already active). */
  public setPipeline(pipeline: BergiumPipeline): void {
    if (pipeline === this.pipeline) return;
    this.swapTo(pipeline);
  }

  /** Toggle between Geiss and Milkdrop. */
  public togglePipeline(): void {
    this.swapTo(this.pipeline === "geiss" ? "milkdrop" : "geiss");
  }

  /** Current active pipeline. */
  public getPipeline(): BergiumPipeline {
    return this.pipeline;
  }

  /** Destroy the active viz and spin up the other pipeline on the same canvas. */
  private swapTo(pipeline: BergiumPipeline): void {
    this.stopPresetCycle();
    this.viz.destroy();
    this.pipeline = pipeline;
    this.viz = this.createViz(pipeline);

    if (pipeline === "milkdrop") {
      // Restore the last preset (if any) and resume the auto-cycle.
      if (this.currentPreset !== null) {
        this.viz.loadPreset(this.currentPreset as Preset, 0.5);
      }
      this.startPresetCycle();
    }
  }

  // --- Butterchurn-compatible contract ----------------------------------------

  /** Connect a Web Audio node (e.g. an AnalyserNode) as the visualizer source. */
  public connectAudio(node: AudioNode): void {
    this.analyser = node;
    this.viz.connectAudio(node);
  }

  /** Update renderer dimensions (canvas already resized by the caller). */
  public setRendererSize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.viz.setRendererSize(width, height);
  }

  /**
   * Load a preset. Also (re)starts the 30s auto-cycle so a user/manual selection
   * resets the countdown, and syncs the cycling index when the preset is found in
   * the built-in list (so advances continue from the selected entry). Accepts
   * `unknown` because Webamp passes raw preset maps.
   */
  public loadPreset(preset: unknown, transitionSeconds = 2.7): void {
    this.currentPreset = preset;
    const idx = this.presets.findIndex((entry) => entry.preset === preset);
    if (idx >= 0) {
      this.presetIndex = idx;
    }
    this.viz.loadPreset(preset as Preset, transitionSeconds);
    if (this.pipeline === "milkdrop") {
      this.startPresetCycle();
    }
  }

  /** Trigger the song-title overlay animation on the active pipeline. */
  public launchSongTitleAnim(title: string): void {
    this.viz.launchSongTitleAnim(title);
  }

  // --- Geiss effect control ---------------------------------------------------

  /** Toggle a Geiss effect at runtime (persists across toggles back to Geiss). */
  public setGeissEffect(name: "chasers" | "shadeBobs" | "grid", enabled: boolean): void {
    this.geissEffects[name] = enabled;
    if (this.pipeline === "geiss" && this.viz instanceof GeissAdapter) {
      this.viz.setEffect(name, enabled);
    }
  }

  // --- Render loop ------------------------------------------------------------

  /** Render a single frame. */
  public render(): void {
    this.viz.render();
  }

  /** Start the internal RAF loop (idempotent). */
  public start(): void {
    if (this.rafHandle !== null) return;
    if (typeof requestAnimationFrame !== "function") return; // non-browser env (tests)
    const loop = (): void => {
      this.render();
      this.rafHandle = requestAnimationFrame(loop);
    };
    this.rafHandle = requestAnimationFrame(loop);
  }

  /** Stop the internal RAF loop (idempotent). */
  public stop(): void {
    if (this.rafHandle !== null && typeof cancelAnimationFrame === "function") {
      cancelAnimationFrame(this.rafHandle);
    }
    this.rafHandle = null;
  }

  // --- Milkdrop preset cycling ------------------------------------------------

  /** Populate the preset list and (optionally) load the initial preset. */
  private async initMilkdrop(): Promise<void> {
    try {
      this.presets = await this.milkdropGetPresets();
    } catch (err) {
      console.warn("[bergium] preset source failed:", err);
      this.presets = [];
    }
    if (this.presets.length === 0) return;

    this.presetIndex = Math.min(
      this.milkdropInitialPresetIndex,
      this.presets.length - 1,
    );

    if (this.milkdropAutoLoadInitial) {
      const initial = this.presets[this.presetIndex];
      if (initial) {
        this.currentPreset = initial.preset;
        this.viz.loadPreset(initial.preset as Preset, 0);
      }
    }
    this.startPresetCycle();
  }

  /** (Re)start the preset auto-cycle timer. */
  private startPresetCycle(): void {
    this.stopPresetCycle();
    if (this.milkdropCycleSeconds <= 0) return;
    if (this.pipeline !== "milkdrop") return;
    this.presetTimer = setInterval(
      () => this.advancePreset(),
      this.milkdropCycleSeconds * 1000,
    );
  }

  /** Clear the preset auto-cycle timer. */
  private stopPresetCycle(): void {
    if (this.presetTimer !== null) {
      clearInterval(this.presetTimer);
      this.presetTimer = null;
    }
  }

  /** Advance to the next preset in the list (wraps around). */
  private advancePreset(): void {
    if (this.presets.length === 0) return;
    this.presetIndex = (this.presetIndex + 1) % this.presets.length;
    const entry = this.presets[this.presetIndex];
    if (entry) {
      this.currentPreset = entry.preset;
      this.viz.loadPreset(entry.preset as Preset, 2.7);
    }
  }

  // --- Teardown ---------------------------------------------------------------

  /** Stop loops, detach listeners, and destroy the active visualizer. */
  public destroy(): void {
    this.stop();
    this.stopPresetCycle();
    if (this.clickHandler !== null && typeof (this.canvas as EventTarget).removeEventListener === "function") {
      (this.canvas as EventTarget).removeEventListener("click", this.clickHandler);
    }
    this.viz.destroy();
  }
}

/**
 * Factory for {@link BergiumPlayer}. Prefer this over the low-level
 * {@link createVisualizer} for demos and integrations that want sensible defaults
 * (dual pipeline, click-toggle, 30s cycles, chasers, built-in presets) for free.
 */
export function createBergiumPlayer(
  audioContext: AudioContext,
  canvas: CanvasLike,
  options?: BergiumPlayerOptions,
): BergiumPlayer {
  return new BergiumPlayer(audioContext, canvas, options);
}
