import ShaderUtils from "./shaderUtils.js";

/**
 * ResampleShader — a fullscreen-quad texture resampler (generates mipmaps).
 *
 * Mechanical TypeScript port of vendor/butterchurn/src/rendering/shaders/resample.js
 * (pinned revision fbac2f6). Shader strings are frozen assets (plan non-goal).
 */

export default class ResampleShader {
  private gl: WebGL2RenderingContext;
  private positions: Float32Array;
  private vertexBuf: WebGLBuffer;
  private floatPrecision: string;
  private shaderProgram!: WebGLProgram;
  private positionLocation!: number;
  private textureLoc!: WebGLUniformLocation | null;

  public constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    this.positions = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);
    this.vertexBuf = gl.createBuffer()!;
    this.floatPrecision = ShaderUtils.getFragmentFloatPrecision(gl);
    this.createShader();
  }

  private createShader(): void {
    const gl = this.gl;
    this.shaderProgram = gl.createProgram()!;

    const vertShader = gl.createShader(gl.VERTEX_SHADER)!;
    gl.shaderSource(
      vertShader,
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
    gl.shaderSource(
      fragShader,
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
    gl.generateMipmap(gl.TEXTURE_2D);

    gl.uniform1i(this.textureLoc, 0);

    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
}
