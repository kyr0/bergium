import ShaderUtils from "./shaderUtils.js";

/**
 * BlurVertical - the vertical pass of the separable Gaussian blur with edge darkening.
 *
 * Mechanical TypeScript port of vendor/butterchurn/src/rendering/shaders/blur/blurVertical.js
 * (pinned revision fbac6f6). Uses 2 weighted taps + b1ed edge-darkening. Frozen GLSL.
 */

export default class BlurVertical {
  private gl: WebGL2RenderingContext;
  public blurLevel: number;
  public wds: Float32Array;
  public wDiv: number;
  private positions: Float32Array;
  private vertexBuf: WebGLBuffer;
  private floatPrecision: string;
  private shaderProgram!: WebGLProgram;
  private positionLocation!: number;
  private textureLoc!: WebGLUniformLocation | null;
  private texsizeLocation!: WebGLUniformLocation | null;
  private ed1Loc!: WebGLUniformLocation | null;
  private ed2Loc!: WebGLUniformLocation | null;
  private ed3Loc!: WebGLUniformLocation | null;
  private wdsLocation!: WebGLUniformLocation | null;
  private wdivLoc!: WebGLUniformLocation | null;

  public constructor(gl: WebGL2RenderingContext, blurLevel: number) {
    this.gl = gl;
    this.blurLevel = blurLevel;
    const w = [4.0, 3.8, 3.5, 2.9, 1.9, 1.2, 0.7, 0.3];
    const w1V = w[0]! + w[1]! + w[2]! + w[3]!;
    const w2V = w[4]! + w[5]! + w[6]! + w[7]!;
    const d1V = 0 + 2 * ((w[2]! + w[3]!) / w1V);
    const d2V = 2 + 2 * ((w[6]! + w[7]!) / w2V);
    this.wds = new Float32Array([w1V, w2V, d1V, d2V]);
    this.wDiv = 1.0 / ((w1V + w2V) * 2);
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
    gl.shaderSource(frag, `#version 300 es\nprecision ${this.floatPrecision} float;\nprecision highp int;\nprecision mediump sampler2D;\nin vec2 uv;\nout vec4 fragColor;\nuniform sampler2D uTexture;\nuniform vec4 texsize;\nuniform float ed1;\nuniform float ed2;\nuniform float ed3;\nuniform vec4 wds;\nuniform float wdiv;\nvoid main(void) {\n  float w1 = wds[0]; float w2 = wds[1];\n  float d1 = wds[2]; float d2 = wds[3];\n  vec2 uv2 = uv.xy;\n  vec3 blur =\n    ( texture(uTexture, uv2 + vec2(0.0, d1 * texsize.w)).xyz\n    + texture(uTexture, uv2 + vec2(0.0,-d1 * texsize.w)).xyz) * w1 +\n    ( texture(uTexture, uv2 + vec2(0.0, d2 * texsize.w)).xyz\n    + texture(uTexture, uv2 + vec2(0.0,-d2 * texsize.w)).xyz) * w2;\n  blur.xyz *= wdiv;\n  float t = min(min(uv.x, uv.y), 1.0 - max(uv.x, uv.y));\n  t = sqrt(t);\n  t = ed1 + ed2 * clamp(t * ed3, 0.0, 1.0);\n  blur.xyz *= t;\n  fragColor = vec4(blur, 1.0);\n}`.trim());
    gl.compileShader(frag);
    gl.attachShader(this.shaderProgram, vert);
    gl.attachShader(this.shaderProgram, frag);
    gl.linkProgram(this.shaderProgram);
    this.positionLocation = gl.getAttribLocation(this.shaderProgram, "aPos");
    this.textureLoc = gl.getUniformLocation(this.shaderProgram, "uTexture");
    this.texsizeLocation = gl.getUniformLocation(this.shaderProgram, "texsize");
    this.ed1Loc = gl.getUniformLocation(this.shaderProgram, "ed1");
    this.ed2Loc = gl.getUniformLocation(this.shaderProgram, "ed2");
    this.ed3Loc = gl.getUniformLocation(this.shaderProgram, "ed3");
    this.wdsLocation = gl.getUniformLocation(this.shaderProgram, "wds");
    this.wdivLoc = gl.getUniformLocation(this.shaderProgram, "wdiv");
  }

  public renderQuadTexture(texture: WebGLTexture, mdVSFrame: Record<string, unknown>, srcTexsize: number[]): void {
    const gl = this.gl;
    gl.useProgram(this.shaderProgram);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuf);
    gl.bufferData(gl.ARRAY_BUFFER, this.positions, gl.STATIC_DRAW);
    gl.vertexAttribPointer(this.positionLocation, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(this.positionLocation);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.uniform1i(this.textureLoc, 0);
    const b1ed = this.blurLevel === 0 ? (mdVSFrame.b1ed as number | undefined ?? 0) : 0.0;
    gl.uniform4fv(this.texsizeLocation, [srcTexsize[0]!, srcTexsize[1]!, 1.0 / srcTexsize[0]!, 1.0 / srcTexsize[1]!]);
    gl.uniform1f(this.ed1Loc, 1.0 - b1ed);
    gl.uniform1f(this.ed2Loc, b1ed);
    gl.uniform1f(this.ed3Loc, 5.0);
    gl.uniform4fv(this.wdsLocation, this.wds);
    gl.uniform1f(this.wdivLoc, this.wDiv);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
}
