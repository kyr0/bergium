import Utils from "./Utils.js";
import { getRNG } from "./rngContext.js";
import type { RNGContext } from "./seededRandom.js";

/**
 * PresetEquationRunner (JS evaluator) - runs a preset's compiled JS equations
 * (init/frame/pixel + per-shape/per-wave) and manages q/t/reg + user-var carry
 * between frames.
 *
 * Mechanical TypeScript port of vendor/butterchurn/src/equations/presetEquationRunner.js
 * (pinned revision fbac2f6). Equation vars are genuinely dynamic (preset code
 * injects arbitrary keys plus megabuf arrays), so they are typed as
 * `Record<string, unknown>`. The WASM/EEL runner is a separate, frozen-asset path
 * (plan non-goal: do not reimplement EEL/WASM).
 */

export type EqVars = Record<string, unknown>;
export type EqFunc = (vars: EqVars) => EqVars;

export interface PresetWave {
  baseVals: EqVars;
  init_eqs?: EqFunc;
  frame_eqs?: EqFunc;
  /** A compiled point-equation function, or "" when the wave has none. */
  point_eqs?: EqFunc | string;
}
export interface PresetShape {
  baseVals: EqVars;
  init_eqs?: EqFunc;
  frame_eqs?: EqFunc;
}
export interface ButterchurnPreset {
  baseVals: EqVars;
  init_eqs: EqFunc;
  frame_eqs: EqFunc;
  pixel_eqs: string | EqFunc;
  waves?: PresetWave[];
  shapes?: PresetShape[];
}
export interface GlobalVars {
  frame: number;
  time: number;
  fps: number;
  bass: number;
  bass_att: number;
  mid: number;
  mid_att: number;
  treb: number;
  treb_att: number;
}
export interface RunnerOpts {
  texsizeX: number;
  texsizeY: number;
  mesh_width: number;
  mesh_height: number;
  aspectx: number;
  aspecty: number;
}

const MEGABUF_SIZE = 1048576;

export default class PresetEquationRunner {
  public rng: RNGContext;
  public preset: ButterchurnPreset;
  public texsizeX: number;
  public texsizeY: number;
  public mesh_width: number;
  public mesh_height: number;
  public aspectx: number;
  public aspecty: number;
  public invAspectx: number;
  public invAspecty: number;
  public qs: string[];
  public ts: string[];
  public regs: string[];

  public runVertEQs = false;
  public gmegabuf: number[] = [];
  public mdVS: EqVars = {};
  public mdVSQInit: EqVars | null = null;
  public mdVSRegs: EqVars | null = null;
  public mdVSFrame: EqVars | null = null;
  public mdVSUserKeys: string[] | null = null;
  public mdVSFrameMap: EqVars | null = null;
  public mdVSShapes: EqVars[] | null = null;
  public mdVSUserKeysShapes: string[][] | null = null;
  public mdVSFrameMapShapes: EqVars[] | null = null;
  public mdVSWaves: EqVars[] | null = null;
  public mdVSUserKeysWaves: string[][] | null = null;
  public mdVSFrameMapWaves: EqVars[] | null = null;
  public mdVSQAfterFrame: EqVars | null = null;
  public mdVSTWaveInits: EqVars[] = [];
  public mdVSTShapeInits: EqVars[] = [];

  public constructor(preset: ButterchurnPreset, globalVars: GlobalVars, opts: RunnerOpts) {
    this.rng = getRNG();
    this.preset = preset;

    this.texsizeX = opts.texsizeX;
    this.texsizeY = opts.texsizeY;
    this.mesh_width = opts.mesh_width;
    this.mesh_height = opts.mesh_height;
    this.aspectx = opts.aspectx;
    this.aspecty = opts.aspecty;
    this.invAspectx = 1.0 / this.aspectx;
    this.invAspecty = 1.0 / this.aspecty;

    this.qs = Utils.range(1, 33).map((x) => `q${x}`);
    this.ts = Utils.range(1, 9).map((x) => `t${x}`);
    this.regs = Utils.range(100).map((x) => {
      if (x < 10) {
        return `reg0${x}`;
      }
      return `reg${x}`;
    });

    this.initializeEquations(globalVars);
  }

  public initializeEquations(globalVars: GlobalVars): void {
    this.runVertEQs = this.preset.pixel_eqs !== "";

    this.mdVSQInit = null;
    this.mdVSRegs = null;
    this.mdVSFrame = null;
    this.mdVSUserKeys = null;
    this.mdVSFrameMap = null;

    this.mdVSShapes = null;
    this.mdVSUserKeysShapes = null;
    this.mdVSFrameMapShapes = null;

    this.mdVSWaves = null;
    this.mdVSUserKeysWaves = null;
    this.mdVSFrameMapWaves = null;

    this.mdVSQAfterFrame = null;

    this.gmegabuf = new Array(MEGABUF_SIZE).fill(0);

    const mdVSBase: EqVars = {
      frame: globalVars.frame,
      time: globalVars.time,
      fps: globalVars.fps,
      bass: globalVars.bass,
      bass_att: globalVars.bass_att,
      mid: globalVars.mid,
      mid_att: globalVars.mid_att,
      treb: globalVars.treb,
      treb_att: globalVars.treb_att,
      meshx: this.mesh_width,
      meshy: this.mesh_height,
      aspectx: this.invAspectx,
      aspecty: this.invAspecty,
      pixelsx: this.texsizeX,
      pixelsy: this.texsizeY,
      gmegabuf: this.gmegabuf,
    };

    this.mdVS = Object.assign({}, this.preset.baseVals, mdVSBase);

    this.mdVS.megabuf = new Array(MEGABUF_SIZE).fill(0);
    this.mdVS.rand_start = new Float32Array([
      this.rng.random(), this.rng.random(), this.rng.random(), this.rng.random(),
    ]);
    this.mdVS.rand_preset = new Float32Array([
      this.rng.random(), this.rng.random(), this.rng.random(), this.rng.random(),
    ]);

    const nonUserKeys = this.qs.concat(this.regs, Object.keys(this.mdVS));

    const mdVSAfterInit = this.preset.init_eqs(Utils.cloneVars(this.mdVS));

    // qs need to be initialized to their init values every frame
    this.mdVSQInit = Utils.pick(mdVSAfterInit, this.qs);
    this.mdVSRegs = Utils.pick(mdVSAfterInit, this.regs);
    const initUserVars = Utils.pick(
      mdVSAfterInit,
      Object.keys(Utils.omit(mdVSAfterInit, nonUserKeys)),
    );
    initUserVars.megabuf = mdVSAfterInit.megabuf;
    initUserVars.gmegabuf = mdVSAfterInit.gmegabuf;

    this.mdVSFrame = this.preset.frame_eqs(
      Object.assign({}, this.mdVS, this.mdVSQInit, this.mdVSRegs, initUserVars),
    );

    // user vars need to be copied between frames
    this.mdVSUserKeys = Object.keys(Utils.omit(this.mdVSFrame, nonUserKeys));

    // Determine vars to carry over between frames
    this.mdVSFrameMap = Utils.pick(this.mdVSFrame, this.mdVSUserKeys);

    // qs for shapes
    this.mdVSQAfterFrame = Utils.pick(this.mdVSFrame, this.qs);
    this.mdVSRegs = Utils.pick(this.mdVSFrame, this.regs);

    this.mdVSWaves = [];
    this.mdVSTWaveInits = [];
    this.mdVSUserKeysWaves = [];
    this.mdVSFrameMapWaves = [];
    if (this.preset.waves && this.preset.waves.length > 0) {
      for (let i = 0; i < this.preset.waves.length; i++) {
        const wave = this.preset.waves[i]!;
        const baseVals = wave.baseVals;
        if (baseVals.enabled !== 0) {
          let mdVSWave: EqVars = Object.assign({}, baseVals, mdVSBase);

          const nonUserWaveKeys = this.qs.concat(this.ts, this.regs, Object.keys(mdVSWave));

          Object.assign(mdVSWave, this.mdVSQAfterFrame, this.mdVSRegs);
          mdVSWave.megabuf = new Array(MEGABUF_SIZE).fill(0);

          if (wave.init_eqs) {
            mdVSWave = wave.init_eqs(mdVSWave);

            this.mdVSRegs = Utils.pick(mdVSWave, this.regs);

            // base vals need to be reset
            Object.assign(mdVSWave, baseVals);
          }
          this.mdVSWaves.push(mdVSWave);
          this.mdVSTWaveInits.push(Utils.pick(mdVSWave, this.ts));

          this.mdVSUserKeysWaves.push(Object.keys(Utils.omit(mdVSWave, nonUserWaveKeys)));
          this.mdVSFrameMapWaves.push(Utils.pick(mdVSWave, this.mdVSUserKeysWaves[i]!));
        } else {
          this.mdVSWaves.push({});
          this.mdVSTWaveInits.push({});
          this.mdVSUserKeysWaves.push([]);
          this.mdVSFrameMapWaves.push({});
        }
      }
    }

    this.mdVSShapes = [];
    this.mdVSTShapeInits = [];
    this.mdVSUserKeysShapes = [];
    this.mdVSFrameMapShapes = [];
    if (this.preset.shapes && this.preset.shapes.length > 0) {
      for (let i = 0; i < this.preset.shapes.length; i++) {
        const shape = this.preset.shapes[i]!;
        const baseVals = shape.baseVals;
        if (baseVals.enabled !== 0) {
          let mdVSShape: EqVars = Object.assign({}, baseVals, mdVSBase);

          const nonUserShapeKeys = this.qs.concat(this.ts, this.regs, Object.keys(mdVSShape));

          Object.assign(mdVSShape, this.mdVSQAfterFrame, this.mdVSRegs);
          mdVSShape.megabuf = new Array(MEGABUF_SIZE).fill(0);

          if (shape.init_eqs) {
            mdVSShape = shape.init_eqs(mdVSShape);

            this.mdVSRegs = Utils.pick(mdVSShape, this.regs);

            // base vals need to be reset
            Object.assign(mdVSShape, baseVals);
          }
          this.mdVSShapes.push(mdVSShape);
          this.mdVSTShapeInits.push(Utils.pick(mdVSShape, this.ts));

          this.mdVSUserKeysShapes.push(Object.keys(Utils.omit(mdVSShape, nonUserShapeKeys)));
          this.mdVSFrameMapShapes.push(Utils.pick(mdVSShape, this.mdVSUserKeysShapes[i]!));
        } else {
          this.mdVSShapes.push({});
          this.mdVSTShapeInits.push({});
          this.mdVSUserKeysShapes.push([]);
          this.mdVSFrameMapShapes.push({});
        }
      }
    }
  }

  public updatePreset(preset: ButterchurnPreset, globalVars: GlobalVars): void {
    this.preset = preset;
    this.initializeEquations(globalVars);
  }

  public updateGlobals(opts: RunnerOpts): void {
    this.texsizeX = opts.texsizeX;
    this.texsizeY = opts.texsizeY;
    this.mesh_width = opts.mesh_width;
    this.mesh_height = opts.mesh_height;
    this.aspectx = opts.aspectx;
    this.aspecty = opts.aspecty;
    this.invAspectx = 1.0 / this.aspectx;
    this.invAspecty = 1.0 / this.aspecty;
  }

  public runFrameEquations(globalVars: GlobalVars): EqVars {
    let frameVars: EqVars = Object.assign(
      {},
      this.mdVS,
      this.mdVSQInit!,
      this.mdVSFrameMap!,
      globalVars,
    );

    frameVars = this.preset.frame_eqs(frameVars);
    this.mdVSFrame = frameVars;

    this.mdVSFrameMap = Utils.pick(frameVars, this.mdVSUserKeys!);
    this.mdVSQAfterFrame = Utils.pick(frameVars, this.qs);

    return frameVars;
  }

  public runPixelEquations(mdVSVertex: EqVars): EqVars {
    return (this.preset.pixel_eqs as EqFunc)(mdVSVertex);
  }

  public runShapeFrameEquations(shapeIdx: number, mdVSShape: EqVars): EqVars {
    return this.preset.shapes![shapeIdx]!.frame_eqs!(mdVSShape);
  }

  public runWaveFrameEquations(waveIdx: number, mdVSWave: EqVars): EqVars {
    return this.preset.waves![waveIdx]!.frame_eqs!(mdVSWave);
  }

  public runWavePointEquations(waveIdx: number, mdVSWaveFrame: EqVars): EqVars {
    return (this.preset.waves![waveIdx]!.point_eqs as EqFunc)(mdVSWaveFrame);
  }
}
