/**
 * GeissAdapter - BergiumVisualizer implementation backed by GeissGpuFrameGraph.
 *
 * Wraps the GPU-only Geiss pipeline so it conforms to the same visualizer API as
 * Milkdrop. Manages: WebGLGraphicsDevice, GeissGpuFrameGraph, palette/map state,
 * and automatic + manual Geiss mode cycling.
 *
 * The Geiss renderer uses a ping-pong feedback loop with GPU warp and palette
 * presentation. Unlike Milkdrop, Geiss has no preset loading - the equivalent
 * concept is "mode switching" which changes the warp map and visual effects.
 */

import type { CanvasLike } from "../api/types.js";
import type { BergiumVisualizer, VisualizerOptions } from "../api/types.js";
import { WebGLGraphicsDevice } from "../graphics/WebGLGraphicsDevice.js";
import { GeissGpuFrameGraph } from "../pipelines/geiss/gpu/GeissGpuFrameGraph.js";
import type { FrameStepInput } from "../pipelines/geiss/gpu/GeissGpuFrameGraph.js";
import { MsvcRandom } from "../pipelines/geiss/reference/MsvcRandom.js";
import { createPalette } from "../pipelines/geiss/reference/Palette.js";
import { createMapParameters } from "../pipelines/geiss/reference/MapParameterFactory.js";
import { quantizeMapTexel } from "../pipelines/geiss/reference/MapField.js";
import type { MapTexel } from "../pipelines/geiss/reference/MapField.js";
import { shadeBobs, twoChasers, gridEffect } from "../pipelines/geiss/reference/Effects.js";

// How many classic Geiss modes to cycle through
const GEISS_MODE_COUNT = 9;

// Default auto-cycle interval in seconds
const DEFAULT_AUTO_CYCLE_SECONDS = 30;

/**
 * Build the warp map for a given mode.
 * Matches vendor/geiss rand_array initialization: 2345 entries of (rand%100)*0.0005.
 */
function buildMap(mode: number, W: number, H: number, rng: MsvcRandom): MapTexel[] {
  // Vendor: rand_array[2345] filled with (rand()%100)*0.0005 for mode 7 fuzziness
  const randomNoise = new Float32Array(2345);
  for (let i = 0; i < 2345; i++) {
    randomNoise[i] = (rng.nextInt(100)) * 0.0005;
  }
  const params = createMapParameters(mode, W, H, 0, 60, 0.98, randomNoise, rng);
  const map: MapTexel[] = new Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      map[y * W + x] = quantizeMapTexel(x, y, params, rng);
    }
  }
  return map;
}

function seedGradient(W: number, H: number): Uint8Array {
  const seed = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      seed[y * W + x] = ((x + y) & 127);
    }
  }
  return seed;
}

/**
 * Paint the audio time-domain waveform into a preWarp contribution buffer,
 * faithfully porting vendor/geiss/main.cpp RenderWave() waveform mode 1:
 * a horizontal trace at vertical center, smoothed 0.9/0.1, MAX-blended.
 *
 * The original uses g_fSoundBuffer[] (float, ~+/-H/4 range); we derive the
 * equivalent from AnalyserNode.getByteTimeDomainData() (uint8, 128=silence).
 */
function audioStep(
  W: number,
  H: number,
  waveData: Uint8Array,
  mode: number,
  frame: number,
  freqData: Uint8Array,
  effects: { shadeBobs: boolean; chasers: boolean; grid: boolean },
): FrameStepInput {
  const contrib = new Uint8Array(W * H);
  const cx = W / 2, cy = H / 2;

  // Brightness for the waveform trace (vendor uses volume-derived r~=100-200)
  const BRIGHTNESS = 160;

  // Vertical center (vendor: gYC ~= FXH/2)
  const yCenter = H / 2;

  // Amplitude scale: map uint8 (128=silence) to pixel offset.
  // Original g_fSoundBuffer spans roughly +/-H*0.15 for normal audio.
  const ampScale = (H * 0.15) / 128;

  // FX_YCUT_HIDE from vendor: skip top/bottom border pixels
  const yCutHide = 4;

  // Smoothed waveform position (vendor: prev_zL * 0.9 + zL * 0.1)
  let prevZ = yCenter;

  const numSamples = Math.min(waveData.length, W);

  for (let x = 0; x < W; x++) {
    // Read audio sample (interleaved L/R in vendor; we use mono average)
    const sampleIdx = Math.min(x, numSamples - 1);
    const raw = waveData[sampleIdx]! - 128; // -128..127
    const z = yCenter + raw * ampScale;

    // Apply smoothing filter (vendor: zL = prev_zL*0.9 + zL*0.1)
    const smoothed = prevZ * 0.9 + z * 0.1;
    prevZ = smoothed;

    const y = Math.trunc(smoothed);

    // Bounds check (vendor: yL >= FX_YCUT_HIDE && yL < FXH-FX_YCUT_HIDE)
    if (y >= yCutHide && y < H - yCutHide) {
      const offset = y * W + x;
      // MAX-blend (vendor: if VS1[offset] < r then VS1[offset] = r)
      if (contrib[offset]! < BRIGHTNESS) {
        contrib[offset] = BRIGHTNESS;
      }
    }
  }

  // Apply enabled effects (vendor/geiss RenderFX - paints into VS1 before warp)
  if (effects.shadeBobs) shadeBobs(contrib, W, H, freqData, frame, cx, cy);
  if (effects.chasers) twoChasers(contrib, W, H, frame, cx, cy);
  if (effects.grid) gridEffect(contrib, W, H, frame);

  return {
    preWarp: contrib,
    postWarp: undefined,
    waveform: undefined,
    diminish: { centerX: cx, centerY: cy, width: W, height: H, cut: 0, centerDwindle: 0.5, mode },
  };
}

/**
 * GeissAdapter conforms to BergiumVisualizer and drives GeissGpuFrameGraph.
 *
 * Limitations (Phase N):
 * - Audio is connected but not yet wired into the frame step (preWarp/postWarp).
 * - setRendererSize triggers a full device+graph recreation (demo acceptable).
 */
export class GeissAdapter implements BergiumVisualizer {
  private readonly device: WebGLGraphicsDevice;
  private readonly graph: GeissGpuFrameGraph;
  private readonly rng: MsvcRandom;
  private readonly W: number;
  private readonly H: number;
  private readonly outCanvas: HTMLCanvasElement;

  private currentMode = 1;
  private frameCount = 0;
  /** Timestamp (performance.now ms) when the current mode started. */
  private modeStartTime = 0;
  /** When true, automatically cycles to the next mode periodically. */
  private autoMode = true;
  /** Auto-cycle interval in seconds (default 30). */
  private autoCycleSeconds = DEFAULT_AUTO_CYCLE_SECONDS;
  /** Effect enable flags (matching vendor/geiss effect[] array). */
  private effects = { shadeBobs: false, chasers: false, grid: false };
  /** Latest frequency-bin data for ShadeBobs (0-255 per bin). */
  private freqData: Uint8Array = new Uint8Array(1024);

  private audioNode: AudioNode | null = null;
  private analyserNode: AnalyserNode | null = null;
  /** Latest time-domain waveform data (0-255, 128=silence) for content injection. */
  private waveData: Uint8Array = new Uint8Array(512);

  public constructor(
    private readonly ctx: AudioContext,
    canvas: CanvasLike,
    options: VisualizerOptions,
  ) {
    // Internal resolution from options (defaults match vendor/geiss 640x480).
    // Higher values = sharper but slower (map gen + pixel readback).
    this.W = options.width ?? 640;
    this.H = options.height ?? 480;
    this.rng = new MsvcRandom(Date.now() & 0xffff);

    // Use an offscreen canvas for the WebGL context so the caller's canvas
    // retains its 2D context for ImageData blitting.
    const glCanvas = typeof OffscreenCanvas !== "undefined"
      ? new OffscreenCanvas(this.W, this.H)
      : document.createElement("canvas");
    if (typeof OffscreenCanvas === "undefined") {
      (glCanvas as HTMLCanvasElement).width = this.W;
      (glCanvas as HTMLCanvasElement).height = this.H;
    }

    this.device = new WebGLGraphicsDevice(glCanvas as HTMLCanvasElement);
    this.outCanvas = canvas as HTMLCanvasElement;
    this.graph = new GeissGpuFrameGraph(this.device, this.W, this.H);

    this.initMode(this.currentMode);
  }

  private initMode(mode: number): void {
    const { colors } = createPalette(this.rng, 10, false, 1, 1);
    this.graph.setPalette(colors);

    const map = buildMap(mode, this.W, this.H, this.rng);
    this.graph.setMap(map);

    if (this.frameCount === 0) {
      const seed = seedGradient(this.W, this.H);
      this.graph.seedFront(seed);
    }

    this.modeStartTime = performance.now();
  }

  // --- BergiumVisualizer contract -------------------------------------------

  public connectAudio(node: AudioNode): void {
    this.audioNode = node;
    this.analyserNode = this.ctx.createAnalyser();
    // Large fftSize for wide waveform traces (vendor: BUFSIZE = max(FXW*3, ...))
    this.analyserNode.fftSize = 2048;
    this.analyserNode.smoothingTimeConstant = 0.6;
    node.connect(this.analyserNode);
  }

  public disconnectAudio(): void {
    if (this.audioNode && this.analyserNode) {
      this.audioNode.disconnect(this.analyserNode);
    }
    this.audioNode = null;
    this.analyserNode = null;
  }

  /** Geiss has no milkdrop-style presets. Call setMode() directly instead. */
  public loadPreset(_preset: Parameters<BergiumVisualizer["loadPreset"]>[0], _transitionSeconds: number): void {
    // No-op: Geiss uses mode numbers, not presets.
  }

  public setRendererSize(width: number, height: number): void {
    void width; void height;
    // Demo: fixed resolution, no resize handling needed.
  }

  /** Title overlay state - text + animation start time (performance.now ms). */
  private titleText: string | null = null;
  private titleStartTime = 0;
  private static readonly TITLE_DURATION_MS = 3000;

  public launchSongTitleAnim(title: string): void {
    this.titleText = title;
    this.titleStartTime = performance.now();
  }

  public setText(options: Parameters<BergiumVisualizer["setText"]>[0]): void {
    if (options.text) {
      this.launchSongTitleAnim(options.text);
    } else {
      this.titleText = null;
    }
  }

  public render(): void {
    this.renderFrame({ timestampSeconds: this.ctx.currentTime });
  }

  public renderFrame(_options?: Parameters<BergiumVisualizer["renderFrame"]>[0]): void {
    // Sample audio time-domain waveform + frequency data for content injection
    this.sampleAudio();

    // Advance the frame graph with audio-driven preWarp + effects
    this.graph.step(audioStep(
      this.W, this.H, this.waveData, this.currentMode,
      this.frameCount, this.freqData, this.effects,
    ));

    // Auto mode switching (time-based, only when enabled)
    if (this.autoMode && (performance.now() - this.modeStartTime) / 1000 >= this.autoCycleSeconds) {
      this.nextMode();
    }

    // Read back pixels and draw to 2D canvas
    this.readPixelsToCanvas();

    this.frameCount++;
  }

  /** Read GPU output back to CPU and draw it to the 2D canvas. */
  private readPixelsToCanvas(): void {
    const rgba = this.graph.presentFrontRgba();
    // presentFrontRgba already applies palette LUT and returns RGBA bytes.
    const ctx2d = this.outCanvas.getContext("2d");
    if (!ctx2d) return;

    // Enable smoothing for better upscaling quality
    ctx2d.imageSmoothingEnabled = true;
    ctx2d.imageSmoothingQuality = "high";

    // Clear canvas to prevent stale content
    ctx2d.fillStyle = "#000";
    ctx2d.fillRect(0, 0, this.outCanvas.width, this.outCanvas.height);

    // Build ImageData (flip Y since WebGL is bottom-up)
    const flipped = new Uint8ClampedArray(this.W * this.H * 4);
    for (let y = 0; y < this.H; y++) {
      const src = (this.H - 1 - y) * this.W * 4;
      const dst = y * this.W * 4;
      flipped.set(rgba.subarray(src, src + this.W * 4), dst);
    }
    const img = new ImageData(flipped, this.W, this.H);

    // Scale to fill the output canvas, centered
    const scaleX = this.outCanvas.width / this.W;
    const scaleY = this.outCanvas.height / this.H;
    const scale = Math.max(scaleX, scaleY);
    const drawW = this.W * scale;
    const drawH = this.H * scale;
    const ox = (this.outCanvas.width - drawW) / 2;
    const oy = (this.outCanvas.height - drawH) / 2;

    // Use the device's internal canvas (where WebGL renders) as drawImage source
    const glCanvas = this.device.canvas;
    const tmp = document.createElement("canvas");
    tmp.width = this.W; tmp.height = this.H;
    const tmpCtx = tmp.getContext("2d")!;
    tmpCtx.putImageData(img, 0, 0);
    ctx2d.drawImage(tmp, ox, oy, drawW, drawH);

    // Draw title overlay if active (fade in/out over TITLE_DURATION_MS)
    if (this.titleText) {
      const elapsed = performance.now() - this.titleStartTime;
      if (elapsed < GeissAdapter.TITLE_DURATION_MS) {
        // Fade: 0=>1 in first 300ms, hold, 1=>0 in last 500ms
        const fadeIn = Math.min(1, elapsed / 300);
        const fadeOut = Math.min(1, (GeissAdapter.TITLE_DURATION_MS - elapsed) / 500);
        const alpha = Math.min(fadeIn, fadeOut);
        const cx = this.outCanvas.width / 2;
        const cy = this.outCanvas.height / 2;
        const fontSize = Math.max(16, Math.min(36, this.outCanvas.width / 30));
        ctx2d.save();
        ctx2d.font = `bold ${fontSize}px sans-serif`;
        ctx2d.textAlign = "center";
        ctx2d.textBaseline = "middle";
        ctx2d.shadowColor = "rgba(0,0,0,0.8)";
        ctx2d.shadowBlur = 8;
        ctx2d.fillStyle = `rgba(255,255,255,${alpha})`;
        ctx2d.fillText(this.titleText, cx, cy);
        ctx2d.restore();
      } else {
        this.titleText = null;
      }
    }
  }

  private sampleAudio(): void {
    if (!this.analyserNode) return;
    // Read time-domain waveform data (0-255, 128 = silence)
    const fftSize = this.analyserNode.fftSize;
    if (this.waveData.length !== fftSize) {
      this.waveData = new Uint8Array(fftSize);
    }
    this.analyserNode.getByteTimeDomainData(this.waveData as Uint8Array<ArrayBuffer>);
    // Read frequency data for ShadeBobs effect
    const binCount = this.analyserNode.frequencyBinCount;
    if (this.freqData.length !== binCount) {
      this.freqData = new Uint8Array(binCount);
    }
    this.analyserNode.getByteFrequencyData(this.freqData as Uint8Array<ArrayBuffer>);
  }

  /** Enable or disable a specific Geiss effect. */
  public setEffect(name: "shadeBobs" | "chasers" | "grid", enabled: boolean): void {
    this.effects[name] = enabled;
  }

  /** Check if a specific Geiss effect is enabled. */
  public getEffect(name: "shadeBobs" | "chasers" | "grid"): boolean {
    return this.effects[name];
  }

  // --- Mode management (Geiss-specific) ------------------------------------

  /** Advance to the next Geiss mode. */
  public nextMode(): void {
    this.currentMode = (this.currentMode % GEISS_MODE_COUNT) + 1;
    this.initMode(this.currentMode);
  }

  /** Switch to a specific Geiss mode (1-GEISS_MODE_COUNT). */
  public setMode(mode: number): void {
    if (mode < 1 || mode > GEISS_MODE_COUNT) return;
    this.currentMode = mode;
    this.initMode(this.currentMode);
  }

  /** Current Geiss mode number (1-based). */
  public getMode(): number {
    return this.currentMode;
  }

  /** Enable or disable automatic mode cycling. */
  public setAutoMode(enabled: boolean): void {
    this.autoMode = enabled;
  }

  /** Whether automatic mode cycling is currently enabled. */
  public getAutoMode(): boolean {
    return this.autoMode;
  }

  /** Set the auto-cycle interval in seconds. */
  public setAutoCycleSeconds(seconds: number): void {
    this.autoCycleSeconds = Math.max(1, seconds);
  }

  /** Get the current auto-cycle interval in seconds. */
  public getAutoCycleSeconds(): number {
    return this.autoCycleSeconds;
  }

  public destroy(): void {
    this.graph.destroy();
    this.device.destroy();
    this.disconnectAudio();
  }
}
