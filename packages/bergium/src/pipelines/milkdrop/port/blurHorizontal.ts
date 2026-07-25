import ShaderUtils from "./shaderUtils.js";

/**
 * BlurHorizontal — the horizontal pass of the separable Gaussian blur.
 *
 * Mechanical TypeScript port of vendor/butterchurn/src/rendering/shaders/blur/blurHorizontal.js
 * (pinned revision fbac6f6). Uses 4 weighted taps with per-level scale/bias.
 * The GLSL shader string is a frozen asset.
 */

export interface BlurOpts {
  texsizeX?: number;
  texsizeY?: number;
}

export default class BlurHorizontal {
  private gl: WebGL2RenderingContext;
  public blurLevel: number;
  public ws: Float32Array;
  public ds: Float32Array;
  public wDiv: number;
  private positions: Float32Array;
  private vertexBuf: WebGLBuffer;
  private floatPrecision: string;
  private shaderProgram!: WebGLProgram;
  private positionLocation!: number;
  private textureLoc!: WebGLUniformLocation | null;
  private texsizeLocation!: WebGLUniformLocation | null;
  private scaleLoc!: WebGLUniformLocation | null;
  private biasLoc!: WebGLUniformLocation | null;
  private wsLoc!: WebGLUniformLocation | null;
  private dsLocation!: WebGLUniformLocation | null;
  private wdivLoc!: WebGLUniformLocation | null;

  public constructor(gl: WebGL2RenderingContext, blurLevel: number, _opts?: BlurOpts) {
    this.gl = gl;
    this.blurLevel = blurLevel;
    const w = [4.0, 3.8, 3.5, 2.9, 1.9, 1.2, 0.7, 0.3];
    const w1H = w[0]! + w[1]!;
    const w2H = w[2]! + w[3]!;
    const w3H = w[4]! + w[5]!;
    const w4H = w[6]! + w[7]!;
    const d1H = 0 + (2 * w[1]!) / w1H;
    const d2H = 2 + (2 * w[3]!) / w2H;
    const d3H = 4 + (2 * w[5]!) / w3H;
    const d4H = 6 + (2 * w[7]!) / w4H;
    this.ws = new Float32Array([w1H, w2H, w3H, w4H]);
    this.ds = new Float32Array([d1H, d2H, d3H, d4H]);
    this.wDiv = 0.5 / (w1H + w2H + w3H + w4H);
    this.positions = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);
    this.vertexBuf = gl.createBuffer()!;
    this.floatPrecision = ShaderUtils.getFragmentFloatPrecision(gl);
    this.createShader();
  }

  private createShader(): void {
    const gl = this.gl;
    this.shaderProgram = gl.createProgram()!;
    const vert = gl.createShader(gl.VERTEX_SHADER)!;
    gl.shaderSource(vert, `#version 300 es\nconst vec2 halfmad = vec2(0.5);\nin vec2 aPos;\nout vec2 uv;\nvoid main(void) {\n  gl_Position = vec4(aPos, 0.0, 1.0);\n  uv = aPos * halfmad + halfmad;\n}`.trim());
    gl.compileShader(vert);
    const frag = gl.createShader(gl.FRAGMENT_SHADER)!;
    gl.shaderSource(frag, `#version 300 es\nprecision ${this.floatPrecision} float;\nprecision highp int;\nprecision mediump sampler2D;\nin vec2 uv;\nout vec4 fragColor;\nuniform sampler2D uTexture;\nuniform vec4 texsize;\nuniform float scale;\nuniform float bias;\nuniform vec4 ws;\nuniform vec4 ds;\nuniform float wdiv;\nvoid main(void) {\n  float w1 = ws[0]; float w2 = ws[1]; float w3 = ws[2]; float w4 = ws[3];\n  float d1 = ds[0]; float d2 = ds[1]; float d3 = ds[2]; float d4 = ds[3];\n  vec2 uv2 = uv.xy;\n  vec3 blur =\n    ( texture(uTexture, uv2 + vec2( d1 * texsize.z,0.0)).xyz\n    + texture(uTexture, uv2 + vec2(-d1 * texsize.z,0.0)).xyz) * w1 +\n    ( texture(uTexture, uv2 + vec2( d2 * texsize.z,0.0)).xyz\n    + texture(uTexture, uv2 + vec2(-d2 * texsize.z,0.0)).xyz) * w2 +\n    ( texture(uTexture, uv2 + vec2( d3 * texsize.z,0.0)).xyz\n    + texture(uTexture, uv2 + vec2(-d3 * texsize.z,0.0)).xyz) * w3 +\n    ( texture(uTexture, uv2 + vec2( d4 * texsize.z,0.0)).xyz\n    + texture(uTexture, uv2 + vec2(-d4 * texsize.z,0.0)).xyz) * w4;\n  blur.xyz *= wdiv;\n  blur.xyz = blur.xyz * scale + bias;\n  fragColor = vec4(blur, 1.0);\n}`.trim());
    gl.compileShader(frag);
    gl.attachShader(this.shaderProgram, vert);
    gl.attachShader(this.shaderProgram, frag);
    gl.linkProgram(this.shaderProgram);
    this.positionLocation = gl.getAttribLocation(this.shaderProgram, "aPos");
    this.textureLoc = gl.getUniformLocation(this.shaderProgram, "uTexture");
    this.texsizeLocation = gl.getUniformLocation(this.shaderProgram, "texsize");
    this.scaleLoc = gl.getUniformLocation(this.shaderProgram, "scale");
    this.biasLoc = gl.getUniformLocation(this.shaderProgram, "bias");
    this.wsLoc = gl.getUniformLocation(this.shaderProgram, "ws");
    this.dsLocation = gl.getUniformLocation(this.shaderProgram, "ds");
    this.wdivLoc = gl.getUniformLocation(this.shaderProgram, "wdiv");
  }

  public getScaleAndBias(blurMins: number[], blurMaxs: number[]): { scale: number; bias: number } {
    const scale = [1, 1, 1];
    const bias = [0, 0, 0];
    let tempMin: number;
    let tempMax: number;
    scale[0] = 1.0 / (blurMaxs[0]! - blurMins[0]!);
    bias[0] = -blurMins[0]! * scale[0]!;
    tempMin = (blurMins[1]! - blurMins[0]!) / (blurMaxs[0]! - blurMins[0]!);
    tempMax = (blurMaxs[1]! - blurMins[0]!) / (blurMaxs[0]! - blurMins[0]!);
    scale[1] = 1.0 / (tempMax - tempMin);
    bias[1] = -tempMin * scale[1]!;
    tempMin = (blurMins[2]! - blurMins[1]!) / (blurMaxs[1]! - blurMins[1]!);
    tempMax = (blurMaxs[2]! - blurMins[1]!) / (blurMaxs[1]! - blurMins[1]!);
    scale[2] = 1.0 / (tempMax - tempMin);
    bias[2] = -tempMin * scale[2]!;
    return { scale: scale[this.blurLevel]!, bias: bias[this.blurLevel]! };
  }

  public renderQuadTexture(texture: WebGLTexture, _mdVSFrame: Record<string, unknown>, blurMins: number[], blurMaxs: number[], srcTexsize: number[]): void {
    const gl = this.gl;
    gl.useProgram(this.shaderProgram);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuf);
    gl.bufferData(gl.ARRAY_BUFFER, this.positions, gl.STATIC_DRAW);
    gl.vertexAttribPointer(this.positionLocation, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(this.positionLocation);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.uniform1i(this.textureLoc, 0);
    const { scale, bias } = this.getScaleAndBias(blurMins, blurMaxs);
    gl.uniform4fv(this.texsizeLocation, [srcTexsize[0]!, srcTexsize[1]!, 1.0 / srcTexsize[0]!, 1.0 / srcTexsize[1]!]);
    gl.uniform1f(this.scaleLoc, scale);
    gl.uniform1f(this.biasLoc, bias);
    gl.uniform4fv(this.wsLoc, this.ws);
    gl.uniform4fv(this.dsLocation, this.ds);
    gl.uniform1f(this.wdivLoc, this.wDiv);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
}
