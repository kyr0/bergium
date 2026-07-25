import type { CanvasLike } from "../../../api/types.js";
import type { RenderTarget } from "../../../graphics/types.js";
import type { LegacyMilkDropPreset } from "../../../presets/types.js";
import type AudioProcessor from "./audioProcessor.js";
import type Renderer from "./renderer.js";
import type { ImageDataEntry } from "./imageTextures.js";
import type { RendererPreset } from "./renderer.js";
import AudioProcessor_Impl from "./audioProcessor.js";
import Renderer_Impl from "./renderer.js";
import { initializeRNG } from "./rngContext.js";

// ─── Internal MilkDrop preset type (used after JSON.parse) ─────────────────────

interface MilkdropPresetShape {
  baseVals: Record<string, number>;
  init_eqs_str?: string;
  frame_eqs_str?: string;
  init_eqs?: (m: unknown) => unknown;
  frame_eqs?: (m: unknown) => unknown;
  enabled?: number;
}

interface MilkdropPresetWave {
  baseVals: Record<string, number>;
  init_eqs_str?: string;
  frame_eqs_str?: string;
  point_eqs_str?: string;
  init_eqs?: (m: unknown) => unknown;
  frame_eqs?: (m: unknown) => unknown;
  point_eqs?: string | ((m: unknown) => unknown);
  enabled?: number;
}

/** Typed view of a butterchurn JSON preset after JSON.parse. */
interface MilkdropPreset {
  baseVals: Record<string, number>;
  init_eqs_str?: string;
  frame_eqs_str?: string;
  pixel_eqs_str?: string;
  init_eqs?: (m: unknown) => unknown;
  frame_eqs?: (m: unknown) => unknown;
  pixel_eqs?: string | ((m: unknown) => unknown);
  shapes: MilkdropPresetShape[];
  waves: MilkdropPresetWave[];
  warp: string;
  comp: string;
  useJS?: boolean;
  // WASM fields (frozen path)
  init_eqs_eel?: string;
  frame_eqs_eel?: string;
  pixel_eqs_eel?: string;
  useWASM?: boolean;
  [key: string]: unknown;
}

/**
 * Butterchurn — the top-level MilkDrop visualizer orchestrator.
 *
 * Mechanical TypeScript port of vendor/butterchurn/src/visualizer.js (pinned
 * revision fbac2f6) and vendor/butterchurn/src/index.js (the factory).
 *
 * Owns: internal WebGL canvas, output canvas 2D context, AudioProcessor, and
 * the Renderer. Implements the `ButterchurnVisualizerHandle` contract used by
 * `MilkdropPipeline`.
 *
 * The WASM preset path is a frozen-asset branch (plan non-goal) preserved
 * verbatim behind casts; the JS path is the active one.
 *
 * @see MilkdropPipeline.ButterchurnVisualizerHandle
 */
export default class Butterchurn {
  private readonly opts: Required<ButterchurnOpts>;
  private readonly internalCanvas: OffscreenCanvas | HTMLCanvasElement;
  private readonly gl: WebGL2RenderingContext;
  private outputGl: CanvasRenderingContext2D | null;
  private readonly audio: AudioProcessor;
  private readonly renderer: Renderer;
  private audioNode: AudioNode | null = null;

  /**
   * @param audioContext  - Web Audio context (must match the context used for the canvas)
   * @param canvas        - Output 2D canvas (the internal WebGL canvas is offscreen/separate)
   * @param rawOpts      - Optional settings; `width`/`height` default to 1200×900
   */
  public constructor(
    audioContext: AudioContext,
    canvas: CanvasLike,
    rawOpts: ButterchurnOpts = {}
  ) {
    const opts: Required<ButterchurnOpts> = {
      width: rawOpts.width ?? 1200,
      height: rawOpts.height ?? 900,
      pixelRatio: rawOpts.pixelRatio ?? (typeof window !== "undefined" ? window.devicePixelRatio : 1),
      meshWidth: rawOpts.meshWidth ?? 48,
      meshHeight: rawOpts.meshHeight ?? 36,
      textureRatio: rawOpts.textureRatio ?? 1,
      outputFXAA: rawOpts.outputFXAA ?? false,
      deterministic: rawOpts.deterministic ?? false,
      testMode: rawOpts.testMode ?? false,
      onlyUseWASM: rawOpts.onlyUseWASM ?? false,
    };
    this.opts = opts;

    // RNG context (matches vendored `initializeRNG(opts)`)
    void initializeRNG({ deterministic: opts.deterministic, testMode: opts.testMode });

    // Create internal canvas (WebGL render target)
    if (typeof OffscreenCanvas !== "undefined") {
      this.internalCanvas = new OffscreenCanvas(opts.width, opts.height);
    } else {
      this.internalCanvas = document.createElement("canvas");
      this.internalCanvas.width = opts.width;
      this.internalCanvas.height = opts.height;
    }

    // WebGL2 context for the renderer
    this.gl = this.internalCanvas.getContext("webgl2", {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: false,
    })!;

    // 2D output context on the caller's canvas
    this.outputGl = canvas.getContext("2d", { willReadFrequently: false }) as CanvasRenderingContext2D | null;

    // Audio processor
    this.audio = new AudioProcessor_Impl(audioContext);

    // Renderer
    this.renderer = new Renderer_Impl(this.gl, this.audio, {
      width: opts.width,
      height: opts.height,
      pixelRatio: opts.pixelRatio,
      meshWidth: opts.meshWidth,
      meshHeight: opts.meshHeight,
      textureRatio: opts.textureRatio,
      outputFXAA: opts.outputFXAA,
    });
  }

  // ─── ButterchurnVisualizerHandle contract ─────────────────────────────────

  /** Connect a Web Audio node as the visualiser's audio source. */
  public connectAudio(node: AudioNode): void {
    this.audioNode = node;
    this.audio.connectAudio(node);
  }

  /** Disconnect the current audio source. */
  public disconnectAudio(_node?: AudioNode): void {
    this.audio.disconnectAudio(_node ?? this.audioNode!);
    this.audioNode = null;
  }

  /**
   * Load a MilkDrop preset.
   *
   * JS presets (with `init_eqs_str`) are compiled to functions via `new Function`
   * before forwarding to the renderer. WASM presets (`init_eqs_eel`) are a frozen
   * non-goal path; the call is cast through and reaches the renderer only if a
   * WASM runner has been injected (plan Phase 8).
   *
   * @param presetMap  - A deep-copyable preset object
   * @param blendTime  - Blend transition time in seconds
   */
  public loadPreset(presetMap: LegacyMilkDropPreset, blendTime = 0): void {
    // Deep-copy to avoid mutating the caller's object
    const preset = JSON.parse(JSON.stringify(presetMap)) as MilkdropPreset;

    // Merge baseVals with factory defaults (matches vendored overrideDefaultVars)
    preset.baseVals = Butterchurn.overrideDefaultVars(
      this.baseValsDefaults,
      preset.baseVals
    );
    for (let i = 0; i < preset.shapes.length; i++) {
      preset.shapes[i]!.baseVals = Butterchurn.overrideDefaultVars(
        this.shapeBaseValsDefaults,
        preset.shapes[i]!.baseVals
      );
    }
    for (let i = 0; i < preset.waves.length; i++) {
      preset.waves[i]!.baseVals = Butterchurn.overrideDefaultVars(
        this.waveBaseValsDefaults,
        preset.waves[i]!.baseVals
      );
    }

    const forceJS = Boolean((preset as unknown as { useJS?: boolean }).useJS) && !this.opts.onlyUseWASM;

    if (
      Object.prototype.hasOwnProperty.call(preset, "init_eqs_eel") &&
      !forceJS
    ) {
      // WASM path (frozen-asset, non-goal). Cast through to renderer.
      (preset as unknown as { useWASM: boolean }).useWASM = true;
      this.renderer.loadPreset(preset as unknown as RendererPreset, blendTime);
    } else if (!this.opts.onlyUseWASM) {
      if (Object.prototype.hasOwnProperty.call(preset, "init_eqs_str")) {
        this.loadJSPreset(preset, blendTime);
      } else {
        console.warn(
          "[Butterchurn] Tried to load a JS preset that doesn't have converted strings"
        );
      }
    } else {
      console.warn(
        "[Butterchurn] Tried to load a preset that doesn't support WASM with onlyUseWASM on"
      );
    }
  }

  /**
   * Milkdrop built-in function preamble — injected into every compiled equation
   * so that presets from butterchurn-presets can reference above(), below(), pow(), etc.
   * Note: `if` is a JS reserved keyword, so we define `_if` and rename calls.
   */
  private static readonly EQ_PREAMBLE = `const sin=Math.sin,cos=Math.cos,tan=Math.tan,asin=Math.asin,acos=Math.acos,atan=Math.atan,atan2=Math.atan2,sinh=Math.sinh,cosh=Math.cosh,tanh=Math.tanh,sqrt=Math.sqrt,pow=Math.pow,exp=Math.exp,log=Math.log,log10=Math.log10,abs=Math.abs,ceil=Math.ceil,floor=Math.floor,round=Math.round,min=Math.min,max=Math.max,sqr=(x)=>x*x,frac=(x)=>x-Math.floor(x),clamp=(x,lo,hi)=>Math.min(hi,Math.max(lo,x)),above=(a,b)=>a>b?1:0,below=(a,b)=>a<b?1:0,equal=(a,b)=>a===b?1:0,_if=(c,a,b)=>c?a:b,sign=(x)=>x>0?1:x<0?-1:0,sigmoid=(x)=>1/(1+Math.exp(-x)),int=(x)=>Math.trunc(x),rand=(m)=>Math.floor(Math.random()*m),randint=(m)=>Math.floor(Math.random()*m),mod=(a,b)=>a%b,div=(a,b)=>Math.trunc(a/b),bor=(a,b)=>a|b,band=(a,b)=>a&b,bnot=(a)=>~a,bshift=(a,b)=>a<<b,gettime=()=>performance.now()*0.001;`;

  /** Replace milkdrop `if(` calls with `_if(` since `if` is a JS reserved keyword. */
  private static sanitizeEqs(eqs: string | undefined): string {
    return (eqs ?? "").replace(/\bif\b/g, "_if");
  }

  /** Compile string equations to functions and forward to the renderer. */
  private loadJSPreset(preset: MilkdropPreset, blendTime: number): void {
    // If init_eqs is already a function, the preset has been prepared already.
    if (typeof preset.init_eqs !== "function") {
      const P = Butterchurn.EQ_PREAMBLE;
      const compile = (eqs: string | undefined): ((m: unknown) => unknown) =>
        new Function("a", `${P} ${Butterchurn.sanitizeEqs(eqs)} return a;`) as (m: unknown) => unknown;

      preset.init_eqs = compile(preset.init_eqs_str);
      preset.frame_eqs = compile(preset.frame_eqs_str);
      if (preset.pixel_eqs_str && preset.pixel_eqs_str !== "") {
        preset.pixel_eqs = compile(preset.pixel_eqs_str);
      } else {
        preset.pixel_eqs = "";
      }

      for (let i = 0; i < preset.shapes.length; i++) {
        const shape = preset.shapes[i]!;
        // Always provide frame_eqs (even for disabled shapes) to avoid runtime errors
        preset.shapes[i] = Object.assign({}, shape, {
          init_eqs: compile(shape.init_eqs_str),
          frame_eqs: compile(shape.frame_eqs_str),
        });
      }

      for (let i = 0; i < preset.waves.length; i++) {
        const wave = preset.waves[i]!;
        const pointFn = wave.point_eqs_str && wave.point_eqs_str !== ""
          ? compile(wave.point_eqs_str)
          : "";

        preset.waves[i] = Object.assign({}, wave, {
          init_eqs: compile(wave.init_eqs_str),
          frame_eqs: compile(wave.frame_eqs_str),
          point_eqs: pointFn,
        });
      }
    }
    this.renderer.loadPreset(preset as unknown as RendererPreset, blendTime);
  }

  /** Load extra user images (e.g. preset image textures). */
  public loadExtraImages(imageData: Record<string, ImageDataEntry>): void {
    this.renderer.loadExtraImages(imageData);
  }

  /** Resize the internal render target and notify the renderer. */
  public setRendererSize(width: number, height: number): void {
    this.internalCanvas.width = width;
    this.internalCanvas.height = height;
    this.renderer.setRendererSize(width, height, {});
  }

  /** Change the output 2D canvas context. */
  public setCanvas(canvas: CanvasLike): void {
    this.outputGl = canvas.getContext("2d", { willReadFrequently: false }) as CanvasRenderingContext2D | null;
  }

  /**
   * Advance one frame and present to the output canvas.
   *
   * Phase 2: when `target` is provided, renders to the Compositor's RenderTarget
   * framebuffer instead of the internal canvas. In this path the 2D
   * `outputGl.drawImage` is skipped — the Compositor is responsible for
   * presenting the target texture.
   */
  public render(target?: RenderTarget | null): void {
    if (target) {
      // Phase 2: render directly to the Compositor's target
      this.renderer.render({ target });
    } else {
      // Legacy path: render to internal canvas then blit to 2D output
      const renderOutput = this.renderer.render({});
      if (this.outputGl) {
        this.outputGl.drawImage(this.internalCanvas, 0, 0);
      }
      void renderOutput;
    }
  }

  /** Trigger the song-title animation overlay. */
  public launchSongTitleAnim(title: string): void {
    this.renderer.launchSongTitleAnim(title);
  }

  /** Render one frame with explicit timestamp/audio options (BergiumVisualizer API). */
  public renderFrame(_options?: { timestampSeconds?: number }): void {
    this.render();
  }

  /** Set overlay text (delegates to song-title animation for now). */
  public setText(options: { text: string }): void {
    if (options.text) {
      this.launchSongTitleAnim(options.text);
    }
  }

  /** Tear down WebGL resources and release the context. */
  public destroy(): void {
    const ext = this.gl.getExtension("WEBGL_lose_context");
    ext?.loseContext();
  }

  // ─── Utility / debugging ───────────────────────────────────────────────────

  /** Return a data URL of the composite output texture. */
  public toDataURL(): string {
    return this.renderer.toDataURL();
  }

  /** Return a data URL of the warp-buffer texture (before composite). */
  public warpBufferToDataURL(): string {
    return this.renderer.warpBufferToDataURL();
  }

  // ─── Private defaults (faithfully mirror vendored source) ─────────────────

  private readonly baseValsDefaults: Record<string, number> = {
    decay: 0.98,
    gammaadj: 2,
    echo_zoom: 2,
    echo_alpha: 0,
    echo_orient: 0,
    red_blue: 0,
    brighten: 0,
    darken: 0,
    wrap: 1,
    darken_center: 0,
    solarize: 0,
    invert: 0,
    bmotionvectorson: 1,
    fshader: 0,
    b1n: 0,
    b2n: 0,
    b3n: 0,
    b1x: 1,
    b2x: 1,
    b3x: 1,
    b1ed: 0.25,
    wave_mode: 0,
    additivewave: 0,
    wave_dots: 0,
    wave_thick: 0,
    wave_a: 0.8,
    wave_scale: 1,
    wave_smoothing: 0.75,
    wave_mystery: 0,
    modwavealphabyvolume: 0,
    modwavealphastart: 0.75,
    modwavealphaend: 0.95,
    wave_r: 1,
    wave_g: 1,
    wave_b: 1,
    wave_x: 0.5,
    wave_y: 0.5,
    wave_brighten: 1,
    mv_x: 12,
    mv_y: 9,
    mv_dx: 0,
    mv_dy: 0,
    mv_l: 0.9,
    mv_r: 1,
    mv_g: 1,
    mv_b: 1,
    mv_a: 1,
    warpanimspeed: 1,
    warpscale: 1,
    zoomexp: 1,
    zoom: 1,
    rot: 0,
    cx: 0.5,
    cy: 0.5,
    dx: 0,
    dy: 0,
    warp: 1,
    sx: 1,
    sy: 1,
    ob_size: 0.01,
    ob_r: 0,
    ob_g: 0,
    ob_b: 0,
    ob_a: 0,
    ib_size: 0.01,
    ib_r: 0.25,
    ib_g: 0.25,
    ib_b: 0.25,
    ib_a: 0,
  };

  private readonly shapeBaseValsDefaults: Record<string, number> = {
    enabled: 0,
    sides: 4,
    additive: 0,
    thickoutline: 0,
    textured: 0,
    num_inst: 1,
    tex_zoom: 1,
    tex_ang: 0,
    x: 0.5,
    y: 0.5,
    rad: 0.1,
    ang: 0,
    r: 1,
    g: 0,
    b: 0,
    a: 1,
    r2: 0,
    g2: 1,
    b2: 0,
    a2: 0,
    border_r: 1,
    border_g: 1,
    border_b: 1,
    border_a: 0.1,
  };

  private readonly waveBaseValsDefaults: Record<string, number> = {
    enabled: 0,
    samples: 512,
    sep: 0,
    scaling: 1,
    smoothing: 0.5,
    r: 1,
    g: 1,
    b: 1,
    a: 1,
    spectrum: 0,
    usedots: 0,
    thick: 0,
    additive: 0,
  };

  // ─── Static helpers (mirror vendored) ─────────────────────────────────────

  /**
   * Merge `baseVals` into `baseValsDefaults`, keeping defaults where no override
   * exists. Used by `loadPreset` to apply per-preset baseVal overrides.
   */
  private static overrideDefaultVars(
    baseValsDefaults: Record<string, number>,
    baseVals: Record<string, number> = {}
  ): Record<string, number> {
    const combined: Record<string, number> = {};
    for (const key of Object.keys(baseValsDefaults)) {
      combined[key] = Object.prototype.hasOwnProperty.call(baseVals, key)
        ? baseVals[key]!
        : baseValsDefaults[key]!;
    }
    return combined;
  }
}

// ─── Options type ────────────────────────────────────────────────────────────

interface ButterchurnOpts {
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
