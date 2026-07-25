import ShaderUtils from "./shaderUtils.js";

/**
 * OutputShader — the final presentation pass (with optional FXAA).
 *
 * Mechanical TypeScript port of vendor/butterchurn/src/rendering/shaders/output.js
 * (pinned revision fbac2f6). FXAA shader is a frozen asset (plan non-goal).
 */

export interface OutputOpts {
  textureRatio: number;
  texsizeX: number;
  texsizeY: number;
}

export default class OutputShader {
  private gl: WebGL2RenderingContext;
  private textureRatio: number;
  private texsizeX: number;
  private texsizeY: number;
  private positions: Float32Array;
  private vertexBuf: WebGLBuffer;
  private floatPrecision: string;
  private shaderProgram!: WebGLProgram;
  private positionLocation!: number;
  private textureLoc!: WebGLUniformLocation | null;
  private texsizeLoc: WebGLUniformLocation | null = null;

  public constructor(gl: WebGL2RenderingContext, opts: OutputOpts) {
    this.gl = gl;
    this.textureRatio = opts.textureRatio;
    this.texsizeX = opts.texsizeX;
    this.texsizeY = opts.texsizeY;
    this.positions = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);
    this.vertexBuf = gl.createBuffer()!;
    this.floatPrecision = ShaderUtils.getFragmentFloatPrecision(gl);
    if (this.useFXAA()) {
      this.createFXAAShader();
    } else {
      this.createShader();
    }
  }

  public useFXAA(): boolean {
    return this.textureRatio <= 1;
  }

  public updateGlobals(opts: OutputOpts): void {
    this.textureRatio = opts.textureRatio;
    this.texsizeX = opts.texsizeX;
    this.texsizeY = opts.texsizeY;
    this.gl.deleteProgram(this.shaderProgram);
    if (this.useFXAA()) {
      this.createFXAAShader();
    } else {
      this.createShader();
    }
  }

  private createFXAAShader(): void {
    const gl = this.gl;
    this.shaderProgram = gl.createProgram()!;
    const vertShader = gl.createShader(gl.VERTEX_SHADER)!;
    gl.shaderSource(vertShader,
      `#version 300 es
       const vec2 halfmad = vec2(0.5);
       in vec2 aPos;
       out vec2 v_rgbM;
       out vec2 v_rgbNW;
       out vec2 v_rgbNE;
       out vec2 v_rgbSW;
       out vec2 v_rgbSE;
       uniform vec4 texsize;
       void main(void) {
         gl_Position = vec4(aPos, 0.0, 1.0);
         v_rgbM = aPos * halfmad + halfmad;
         v_rgbNW = v_rgbM + (vec2(-1.0, -1.0) * texsize.zx);
         v_rgbNE = v_rgbM + (vec2(1.0, -1.0) * texsize.zx);
         v_rgbSW = v_rgbM + (vec2(-1.0, 1.0) * texsize.zx);
         v_rgbSE = v_rgbM + (vec2(1.0, 1.0) * texsize.zx);
       }`,
    );
    gl.compileShader(vertShader);

    const fragShader = gl.createShader(gl.FRAGMENT_SHADER)!;
    gl.shaderSource(fragShader,
      `#version 300 es
       precision ${this.floatPrecision} float;
       precision highp int;
       precision mediump sampler2D;
       in vec2 v_rgbM;
       in vec2 v_rgbNW;
       in vec2 v_rgbNE;
       in vec2 v_rgbSW;
       in vec2 v_rgbSE;
       out vec4 fragColor;
       uniform vec4 texsize;
       uniform sampler2D uTexture;
       #ifndef FXAA_REDUCE_MIN
         #define FXAA_REDUCE_MIN   (1.0/ 128.0)
       #endif
       #ifndef FXAA_REDUCE_MUL
         #define FXAA_REDUCE_MUL   (1.0 / 8.0)
       #endif
       #ifndef FXAA_SPAN_MAX
         #define FXAA_SPAN_MAX     8.0
       #endif
       void main(void) {
         vec4 color;
         vec3 rgbNW = textureLod(uTexture, v_rgbNW, 0.0).xyz;
         vec3 rgbNE = textureLod(uTexture, v_rgbNE, 0.0).xyz;
         vec3 rgbSW = textureLod(uTexture, v_rgbSW, 0.0).xyz;
         vec3 rgbSE = textureLod(uTexture, v_rgbSE, 0.0).xyz;
         vec3 rgbM  = textureLod(uTexture, v_rgbM, 0.0).xyz;
         vec3 luma = vec3(0.299, 0.587, 0.114);
         float lumaNW = dot(rgbNW, luma);
         float lumaNE = dot(rgbNE, luma);
         float lumaSW = dot(rgbSW, luma);
         float lumaSE = dot(rgbSE, luma);
         float lumaM  = dot(rgbM,  luma);
         float lumaMin = min(lumaM, min(min(lumaNW, lumaNE), min(lumaSW, lumaSE)));
         float lumaMax = max(lumaM, max(max(lumaNW, lumaNE), max(lumaSW, lumaSE)));
         mediump vec2 dir;
         dir.x = -((lumaNW + lumaNE) - (lumaSW + lumaSE));
         dir.y =  ((lumaNW + lumaSW) - (lumaNE + lumaSE));
         float dirReduce = max((lumaNW + lumaNE + lumaSW + lumaSE) *
                               (0.25 * FXAA_REDUCE_MUL), FXAA_REDUCE_MIN);
         float rcpDirMin = 1.0 / (min(abs(dir.x), abs(dir.y)) + dirReduce);
         dir = min(vec2(FXAA_SPAN_MAX, FXAA_SPAN_MAX),
                   max(vec2(-FXAA_SPAN_MAX, -FXAA_SPAN_MAX),
                   dir * rcpDirMin)) * texsize.zw;
         vec3 rgbA = 0.5 * (
             textureLod(uTexture, v_rgbM + dir * (1.0 / 3.0 - 0.5), 0.0).xyz +
             textureLod(uTexture, v_rgbM + dir * (2.0 / 3.0 - 0.5), 0.0).xyz);
         vec3 rgbB = rgbA * 0.5 + 0.25 * (
             textureLod(uTexture, v_rgbM + dir * -0.5, 0.0).xyz +
             textureLod(uTexture, v_rgbM + dir * 0.5, 0.0).xyz);
         float lumaB = dot(rgbB, luma);
         if ((lumaB < lumaMin) || (lumaB > lumaMax))
           color = vec4(rgbA, 1.0);
         else
           color = vec4(rgbB, 1.0);
         fragColor = color;
       }`,
    );
    gl.compileShader(fragShader);
    gl.attachShader(this.shaderProgram, vertShader);
    gl.attachShader(this.shaderProgram, fragShader);
    gl.linkProgram(this.shaderProgram);
    this.positionLocation = gl.getAttribLocation(this.shaderProgram, "aPos");
    this.textureLoc = gl.getUniformLocation(this.shaderProgram, "uTexture");
    this.texsizeLoc = gl.getUniformLocation(this.shaderProgram, "texsize");
  }

  private createShader(): void {
    const gl = this.gl;
    this.shaderProgram = gl.createProgram()!;
    const vertShader = gl.createShader(gl.VERTEX_SHADER)!;
    gl.shaderSource(vertShader,
      `#version 300 es
       const vec2 halfmad = vec2(0.5);
       in vec2 aPos;
       out vec2 uv;
       void main(void) {
         gl_Position = vec4(aPos, 0.0, 1.0);
         uv = aPos * halfmad + halfmad;
       }`,
    );
    gl.compileShader(vertShader);
    const fragShader = gl.createShader(gl.FRAGMENT_SHADER)!;
    gl.shaderSource(fragShader,
      `#version 300 es
       precision ${this.floatPrecision} float;
       precision highp int;
       precision mediump sampler2D;
       in vec2 uv;
       out vec4 fragColor;
       uniform sampler2D uTexture;
       void main(void) {
         fragColor = vec4(texture(uTexture, uv).rgb, 1.0);
       }`,
    );
    gl.compileShader(fragShader);
    gl.attachShader(this.shaderProgram, vertShader);
    gl.attachShader(this.shaderProgram, fragShader);
    gl.linkProgram(this.shaderProgram);
    this.positionLocation = gl.getAttribLocation(this.shaderProgram, "aPos");
    this.textureLoc = gl.getUniformLocation(this.shaderProgram, "uTexture");
  }

  public renderQuadTexture(texture: WebGLTexture): void {
    const gl = this.gl;
    gl.useProgram(this.shaderProgram);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuf);
    gl.bufferData(gl.ARRAY_BUFFER, this.positions, gl.STATIC_DRAW);
    gl.vertexAttribPointer(this.positionLocation, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(this.positionLocation);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.uniform1i(this.textureLoc, 0);
    if (this.useFXAA()) {
      gl.uniform4fv(this.texsizeLoc, new Float32Array([
        this.texsizeX, this.texsizeY, 1.0 / this.texsizeX, 1.0 / this.texsizeY,
      ]));
    }
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
}
