import Utils from "./Utils.js";
import ShaderUtils from "./shaderUtils.js";
import WaveUtils from "./waveUtils.js";
import PresetEquationRunner, {
  type EqVars,
  type GlobalVars,
  type PresetWave,
} from "./presetEquationRunner.js";

/**
 * CustomWaveform — renders a single user-defined (per-frame/per-point equation)
 * waveform for one of the 4 MilkDrop custom-wave slots.
 *
 * Mechanical TypeScript port of vendor/butterchurn/src/rendering/waves/customWaveform.js
 * (pinned revision fbac6f6). GLSL frozen verbatim. Equation vars are genuinely
 * dynamic, so EqVars reads are coerced via `num()`. The WASM/EEL branch is a
 * frozen-asset path (plan non-goal) preserved verbatim behind casts.
 */

const MAX_SAMPLES = 512;

/** Coerce a dynamic equation var to a number (matches vendored numeric coercion). */
const num = (v: unknown): number => v as number;

/** Typed view of a WASM var pool entry (frozen EEL path only). */
type WasmVarPool = Record<string, { value: number }>;

export interface CustomWaveformOpts {
  texsizeX: number;
  texsizeY: number;
  mesh_width: number;
  mesh_height: number;
  aspectx: number;
  aspecty: number;
}

export default class CustomWaveform {
  private index: number;
  private gl: WebGL2RenderingContext;

  private pointsData: Float32Array[];
  private positions: Float32Array;
  private colors: Float32Array;
  private smoothedPositions: Float32Array;
  private smoothedColors: Float32Array;

  private texsizeX: number;
  private texsizeY: number;
  // Faithful dead state: assigned in vendored source, never read; kept verbatim for honest 1:1 parity.
  private mesh_width: number;
  private mesh_height: number;
  private aspectx: number;
  private aspecty: number;
  private invAspectx: number;
  private invAspecty: number;

  private positionVertexBuf: WebGLBuffer;
  private colorVertexBuf: WebGLBuffer;

  private floatPrecision: string;
  private shaderProgram!: WebGLProgram;
  private aPosLocation!: number;
  private aColorLocation!: number;
  private sizeLoc!: WebGLUniformLocation | null;
  private thickOffsetLoc!: WebGLUniformLocation | null;

  private samples: number;
  private mdVSWaveFrame!: EqVars;

  public constructor(index: number, gl: WebGL2RenderingContext, opts: CustomWaveformOpts) {
    this.index = index;
    this.gl = gl;

    this.pointsData = [
      new Float32Array(MAX_SAMPLES),
      new Float32Array(MAX_SAMPLES),
    ];
    this.positions = new Float32Array(MAX_SAMPLES * 3);
    this.colors = new Float32Array(MAX_SAMPLES * 4);
    this.smoothedPositions = new Float32Array((MAX_SAMPLES * 2 - 1) * 3);
    this.smoothedColors = new Float32Array((MAX_SAMPLES * 2 - 1) * 4);

    this.texsizeX = opts.texsizeX;
    this.texsizeY = opts.texsizeY;
    this.mesh_width = opts.mesh_width;
    this.mesh_height = opts.mesh_height;
    this.aspectx = opts.aspectx;
    this.aspecty = opts.aspecty;
    this.invAspectx = 1.0 / this.aspectx;
    this.invAspecty = 1.0 / this.aspecty;

    this.samples = 0;

    this.positionVertexBuf = this.gl.createBuffer()!;
    this.colorVertexBuf = this.gl.createBuffer()!;

    this.floatPrecision = ShaderUtils.getFragmentFloatPrecision(this.gl);
    this.createShader();
  }

  public updateGlobals(opts: CustomWaveformOpts): void {
    this.texsizeX = opts.texsizeX;
    this.texsizeY = opts.texsizeY;
    this.mesh_width = opts.mesh_width;
    this.mesh_height = opts.mesh_height;
    this.aspectx = opts.aspectx;
    this.aspecty = opts.aspecty;
    this.invAspectx = 1.0 / this.aspectx;
    this.invAspecty = 1.0 / this.aspecty;
  }

  /** Compile + link the per-vertex color + point-size shader program. */
  public createShader(): void {
    this.shaderProgram = this.gl.createProgram()!;

    const vertShader = this.gl.createShader(this.gl.VERTEX_SHADER)!;
    this.gl.shaderSource(
      vertShader,
      `
      #version 300 es
      uniform float uSize;
      uniform vec2 thickOffset;
      in vec3 aPos;
      in vec4 aColor;
      out vec4 vColor;
      void main(void) {
        vColor = aColor;
        gl_PointSize = uSize;
        gl_Position = vec4(aPos + vec3(thickOffset, 0.0), 1.0);
      }
      `.trim()
    );
    this.gl.compileShader(vertShader);

    const fragShader = this.gl.createShader(this.gl.FRAGMENT_SHADER)!;
    this.gl.shaderSource(
      fragShader,
      `
      #version 300 es
      precision ${this.floatPrecision} float;
      precision highp int;
      precision mediump sampler2D;
      in vec4 vColor;
      out vec4 fragColor;
      void main(void) {
        fragColor = vColor;
      }
      `.trim()
    );
    this.gl.compileShader(fragShader);

    this.gl.attachShader(this.shaderProgram, vertShader);
    this.gl.attachShader(this.shaderProgram, fragShader);
    this.gl.linkProgram(this.shaderProgram);

    this.aPosLocation = this.gl.getAttribLocation(this.shaderProgram, "aPos");
    this.aColorLocation = this.gl.getAttribLocation(
      this.shaderProgram,
      "aColor"
    );

    this.sizeLoc = this.gl.getUniformLocation(this.shaderProgram, "uSize");
    this.thickOffsetLoc = this.gl.getUniformLocation(
      this.shaderProgram,
      "thickOffset"
    );
  }

  /** Build the per-point custom-wave vertices via the preset equations; false when hidden. */
  public generateWaveform(
    timeArrayL: Float32Array,
    timeArrayR: Float32Array,
    freqArrayL: Float32Array,
    freqArrayR: Float32Array,
    globalVars: GlobalVars,
    presetEquationRunner: PresetEquationRunner,
    waveEqs: PresetWave,
    alphaMult: number
  ): boolean {
    if (num(waveEqs.baseVals.enabled) !== 0 && timeArrayL.length > 0) {
      let mdVSWaveFrame: EqVars;
      const useWASM = (presetEquationRunner.preset as unknown as { useWASM?: boolean }).useWASM;
      if (useWASM) {
        mdVSWaveFrame = presetEquationRunner.runWaveFrameEquations(
          this.index,
          globalVars as unknown as EqVars
        );
      } else {
        const mdVSWave = Object.assign(
          {},
          presetEquationRunner.mdVSWaves![this.index]!,
          presetEquationRunner.mdVSFrameMapWaves![this.index]!,
          presetEquationRunner.mdVSQAfterFrame!,
          presetEquationRunner.mdVSTWaveInits[this.index]!,
          globalVars
        );

        mdVSWaveFrame = presetEquationRunner.runWaveFrameEquations(
          this.index,
          mdVSWave
        );
      }

      if (Object.prototype.hasOwnProperty.call(mdVSWaveFrame, "samples")) {
        this.samples = num(mdVSWaveFrame.samples);
      } else {
        this.samples = MAX_SAMPLES;
      }

      if (this.samples > MAX_SAMPLES) {
        this.samples = MAX_SAMPLES;
      }
      this.samples = Math.floor(this.samples);

      const baseVals = presetEquationRunner.preset.waves![this.index]!.baseVals;

      const sep = Math.floor(num(mdVSWaveFrame.sep));
      const scaling = num(mdVSWaveFrame.scaling);
      const spectrum = num(mdVSWaveFrame.spectrum);
      const smoothing = num(mdVSWaveFrame.smoothing);
      const usedots = num(baseVals.usedots);

      const frameR = num(mdVSWaveFrame.r);
      const frameG = num(mdVSWaveFrame.g);
      const frameB = num(mdVSWaveFrame.b);
      const frameA = num(mdVSWaveFrame.a);

      const waveScale = num(presetEquationRunner.preset.baseVals.wave_scale);

      this.samples -= sep;

      if (this.samples >= 2 || (usedots !== 0 && this.samples >= 1)) {
        const useSpectrum = spectrum !== 0;
        const scale = (useSpectrum ? 0.15 : 0.004) * scaling * waveScale;
        const pointsLeft = useSpectrum ? freqArrayL : timeArrayL;
        const pointsRight = useSpectrum ? freqArrayR : timeArrayR;

        const j0 = useSpectrum
          ? 0
          : Math.floor((MAX_SAMPLES - this.samples) / 2 - sep / 2);
        const j1 = useSpectrum
          ? 0
          : Math.floor((MAX_SAMPLES - this.samples) / 2 + sep / 2);
        const t = useSpectrum ? (MAX_SAMPLES - sep) / this.samples : 1;
        const mix1 = (smoothing * 0.98) ** 0.5;
        const mix2 = 1 - mix1;

        // Milkdrop smooths waveform forward, backward and then scales
        this.pointsData[0]![0] = pointsLeft[j0]!;
        this.pointsData[1]![0] = pointsRight[j1]!;
        for (let j = 1; j < this.samples; j++) {
          const left = pointsLeft[Math.floor(j * t + j0)]!;
          const right = pointsRight[Math.floor(j * t + j1)]!;
          this.pointsData[0]![j] =
            left * mix2 + this.pointsData[0]![j - 1]! * mix1;
          this.pointsData[1]![j] =
            right * mix2 + this.pointsData[1]![j - 1]! * mix1;
        }
        for (let j = this.samples - 2; j >= 0; j--) {
          this.pointsData[0]![j] =
            this.pointsData[0]![j]! * mix2 + this.pointsData[0]![j + 1]! * mix1;
          this.pointsData[1]![j] =
            this.pointsData[1]![j]! * mix2 + this.pointsData[1]![j + 1]! * mix1;
        }
        for (let j = 0; j < this.samples; j++) {
          this.pointsData[0]![j] = this.pointsData[0]![j]! * scale;
          this.pointsData[1]![j] = this.pointsData[1]![j]! * scale;
        }

        if (!useWASM) {
          for (let j = 0; j < this.samples; j++) {
            const value1 = this.pointsData[0]![j]!;
            const value2 = this.pointsData[1]![j]!;

            mdVSWaveFrame.sample = j / (this.samples - 1);
            mdVSWaveFrame.value1 = value1;
            mdVSWaveFrame.value2 = value2;
            mdVSWaveFrame.x = 0.5 + value1;
            mdVSWaveFrame.y = 0.5 + value2;
            mdVSWaveFrame.r = frameR;
            mdVSWaveFrame.g = frameG;
            mdVSWaveFrame.b = frameB;
            mdVSWaveFrame.a = frameA;

            if (waveEqs.point_eqs !== "") {
              mdVSWaveFrame = presetEquationRunner.runWavePointEquations(
                this.index,
                mdVSWaveFrame
              );
            }

            const x = (num(mdVSWaveFrame.x) * 2 - 1) * this.invAspectx;
            const y = (num(mdVSWaveFrame.y) * -2 + 1) * this.invAspecty;
            const r = num(mdVSWaveFrame.r);
            const g = num(mdVSWaveFrame.g);
            const b = num(mdVSWaveFrame.b);
            const a = num(mdVSWaveFrame.a);

            this.positions[j * 3 + 0] = x;
            this.positions[j * 3 + 1] = y;
            this.positions[j * 3 + 2] = 0;

            this.colors[j * 4 + 0] = r;
            this.colors[j * 4 + 1] = g;
            this.colors[j * 4 + 2] = b;
            this.colors[j * 4 + 3] = a * alphaMult;
          }
        } else {
          // WASM path (frozen EEL asset, plan non-goal): preserved verbatim.
          const wasmPreset = presetEquationRunner.preset as unknown as {
            globalPools: Record<string, WasmVarPool>;
            waves: Array<{ point_eqs: () => void }>;
          };
          const varPool = wasmPreset.globalPools[`wavePerFrame${this.index}`]!;
          for (let j = 0; j < this.samples; j++) {
            const value1 = this.pointsData[0]![j]!;
            const value2 = this.pointsData[1]![j]!;

            varPool.sample!.value = j / (this.samples - 1);
            varPool.value1!.value = value1;
            varPool.value2!.value = value2;
            varPool.x!.value = 0.5 + value1;
            varPool.y!.value = 0.5 + value2;
            varPool.r!.value = frameR;
            varPool.g!.value = frameG;
            varPool.b!.value = frameB;
            varPool.a!.value = frameA;

            if (waveEqs.point_eqs) {
              wasmPreset.waves[this.index]!.point_eqs();
            }

            const x = (varPool.x!.value * 2 - 1) * this.invAspectx;
            const y = (varPool.y!.value * -2 + 1) * this.invAspecty;
            const r = varPool.r!.value;
            const g = varPool.g!.value;
            const b = varPool.b!.value;
            const a = varPool.a!.value;

            this.positions[j * 3 + 0] = x;
            this.positions[j * 3 + 1] = y;
            this.positions[j * 3 + 2] = 0;

            this.colors[j * 4 + 0] = r;
            this.colors[j * 4 + 1] = g;
            this.colors[j * 4 + 2] = b;
            this.colors[j * 4 + 3] = a * alphaMult;
          }
        }

        // this needs to be after per point (check fishbrain - witchcraft)
        if (!useWASM) {
          const mdvsUserKeysWave =
            presetEquationRunner.mdVSUserKeysWaves![this.index]!;
          const mdVSNewFrameMapWave = Utils.pick(
            mdVSWaveFrame,
            mdvsUserKeysWave
          );

          presetEquationRunner.mdVSFrameMapWaves![
            this.index
          ] = mdVSNewFrameMapWave;
        } else {
          mdVSWaveFrame.usedots = usedots;
          mdVSWaveFrame.thick = num(baseVals.thick);
          mdVSWaveFrame.additive = num(baseVals.additive);
        }

        this.mdVSWaveFrame = mdVSWaveFrame;

        if (usedots === 0) {
          WaveUtils.smoothWaveAndColor(
            this.positions,
            this.colors,
            this.smoothedPositions,
            this.smoothedColors,
            this.samples
          );
        }

        return true;
      }
    }

    return false;
  }

  public drawCustomWaveform(
    blendProgress: number,
    timeArrayL: Float32Array,
    timeArrayR: Float32Array,
    freqArrayL: Float32Array,
    freqArrayR: Float32Array,
    globalVars: GlobalVars,
    presetEquationRunner: PresetEquationRunner,
    waveEqs: PresetWave
  ): void {
    if (
      waveEqs &&
      this.generateWaveform(
        timeArrayL,
        timeArrayR,
        freqArrayL,
        freqArrayR,
        globalVars,
        presetEquationRunner,
        waveEqs,
        blendProgress
      )
    ) {
      this.gl.useProgram(this.shaderProgram);

      const waveUseDots = num(this.mdVSWaveFrame.usedots) !== 0;
      const waveThick = num(this.mdVSWaveFrame.thick) !== 0;
      const waveAdditive = num(this.mdVSWaveFrame.additive) !== 0;

      let positions: Float32Array;
      let colors: Float32Array;
      let numVerts: number;
      if (!waveUseDots) {
        positions = this.smoothedPositions;
        colors = this.smoothedColors;
        numVerts = this.samples * 2 - 1;
      } else {
        positions = this.positions;
        colors = this.colors;
        numVerts = this.samples;
      }

      this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.positionVertexBuf);
      this.gl.bufferData(this.gl.ARRAY_BUFFER, positions, this.gl.STATIC_DRAW);

      this.gl.vertexAttribPointer(
        this.aPosLocation,
        3,
        this.gl.FLOAT,
        false,
        0,
        0
      );
      this.gl.enableVertexAttribArray(this.aPosLocation);

      this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.colorVertexBuf);
      this.gl.bufferData(this.gl.ARRAY_BUFFER, colors, this.gl.STATIC_DRAW);

      this.gl.vertexAttribPointer(
        this.aColorLocation,
        4,
        this.gl.FLOAT,
        false,
        0,
        0
      );
      this.gl.enableVertexAttribArray(this.aColorLocation);

      let instances = 1;
      if (waveUseDots) {
        if (waveThick) {
          this.gl.uniform1f(this.sizeLoc, 2 + (this.texsizeX >= 1024 ? 1 : 0));
        } else {
          this.gl.uniform1f(this.sizeLoc, 1 + (this.texsizeX >= 1024 ? 1 : 0));
        }
      } else {
        this.gl.uniform1f(this.sizeLoc, 1);
        if (waveThick) {
          instances = 4;
        }
      }

      if (waveAdditive) {
        this.gl.blendFunc(this.gl.SRC_ALPHA, this.gl.ONE);
      } else {
        this.gl.blendFunc(this.gl.SRC_ALPHA, this.gl.ONE_MINUS_SRC_ALPHA);
      }

      const drawMode = waveUseDots ? this.gl.POINTS : this.gl.LINE_STRIP;

      // TODO: use drawArraysInstanced
      for (let i = 0; i < instances; i++) {
        const offset = 2;
        if (i === 0) {
          this.gl.uniform2fv(this.thickOffsetLoc, [0, 0]);
        } else if (i === 1) {
          this.gl.uniform2fv(this.thickOffsetLoc, [offset / this.texsizeX, 0]);
        } else if (i === 2) {
          this.gl.uniform2fv(this.thickOffsetLoc, [0, offset / this.texsizeY]);
        } else if (i === 3) {
          this.gl.uniform2fv(this.thickOffsetLoc, [
            offset / this.texsizeX,
            offset / this.texsizeY,
          ]);
        }

        this.gl.drawArrays(drawMode, 0, numVerts);
      }
    }
  }
}
