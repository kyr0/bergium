import ShaderUtils from "./shaderUtils.js";

/**
 * DarkenCenter — a small radial-gradient sprite that darkens the screen center.
 *
 * Mechanical TypeScript port of vendor/butterchurn/src/rendering/sprites/darkenCenter.js
 * (pinned revision fbac2f6). NOTE: the vendored file mis-names its class
 * `CustomShape` (a copy-paste error); renamed to `DarkenCenter` for clarity.
 * Shader strings are frozen assets.
 */

export interface DarkenCenterOpts {
  aspectx: number;
  aspecty: number;
}

export default class DarkenCenter {
  private gl: WebGL2RenderingContext;
  private aspectx: number;
  private aspecty: number;
  // Faithful dead state: assigned in vendored source, never read; kept verbatim for honest 1:1 parity.
  private invAspectx: number;
  private invAspecty: number;
  private positions!: Float32Array;
  private readonly colors: Float32Array;
  private positionVertexBuf: WebGLBuffer;
  private colorVertexBuf: WebGLBuffer;
  private floatPrecision: string;
  private shaderProgram!: WebGLProgram;
  private aPosLocation!: number;
  private aColorLocation!: number;

  public constructor(gl: WebGL2RenderingContext, opts: DarkenCenterOpts) {
    this.gl = gl;
    this.aspectx = opts.aspectx;
    this.aspecty = opts.aspecty;
    this.invAspectx = 1.0 / this.aspectx;
    this.invAspecty = 1.0 / this.aspecty;

    this.generatePositions();

    this.colors = new Float32Array([
      0, 0, 0, 3 / 32,
      0, 0, 0, 0,
      0, 0, 0, 0,
      0, 0, 0, 0,
      0, 0, 0, 0,
      0, 0, 0, 0,
    ]);

    this.positionVertexBuf = gl.createBuffer()!;
    this.colorVertexBuf = gl.createBuffer()!;
    this.floatPrecision = ShaderUtils.getFragmentFloatPrecision(gl);
    this.createShader();
  }

  public updateGlobals(opts: DarkenCenterOpts): void {
    this.aspectx = opts.aspectx;
    this.aspecty = opts.aspecty;
    this.invAspectx = 1.0 / this.aspectx;
    this.invAspecty = 1.0 / this.aspecty;
    this.generatePositions();
  }

  private generatePositions(): void {
    const halfSize = 0.05;
    this.positions = new Float32Array([
      0, 0, 0,
      -halfSize * this.aspecty, 0, 0,
      0, -halfSize, 0,
      halfSize * this.aspecty, 0, 0,
      0, halfSize, 0,
      -halfSize * this.aspecty, 0, 0,
    ]);
  }

  private createShader(): void {
    const gl = this.gl;
    this.shaderProgram = gl.createProgram()!;

    const vertShader = gl.createShader(gl.VERTEX_SHADER)!;
    gl.shaderSource(vertShader,
      `#version 300 es
       in vec3 aPos;
       in vec4 aColor;
       out vec4 vColor;
       void main(void) {
         vColor = aColor;
         gl_Position = vec4(aPos, 1.0);
       }`.trim(),
    );
    gl.compileShader(vertShader);

    const fragShader = gl.createShader(gl.FRAGMENT_SHADER)!;
    gl.shaderSource(fragShader,
      `#version 300 es
       precision ${this.floatPrecision} float;
       precision highp int;
       precision mediump sampler2D;
       in vec4 vColor;
       out vec4 fragColor;
       void main(void) {
         fragColor = vColor;
       }`.trim(),
    );
    gl.compileShader(fragShader);

    gl.attachShader(this.shaderProgram, vertShader);
    gl.attachShader(this.shaderProgram, fragShader);
    gl.linkProgram(this.shaderProgram);

    this.aPosLocation = gl.getAttribLocation(this.shaderProgram, "aPos");
    this.aColorLocation = gl.getAttribLocation(this.shaderProgram, "aColor");
  }

  public drawDarkenCenter(mdVSFrame: Record<string, unknown>): void {
    if (mdVSFrame.darken_center !== 0) {
      const gl = this.gl;
      gl.useProgram(this.shaderProgram);

      gl.bindBuffer(gl.ARRAY_BUFFER, this.positionVertexBuf);
      gl.bufferData(gl.ARRAY_BUFFER, this.positions, gl.STATIC_DRAW);
      gl.vertexAttribPointer(this.aPosLocation, 3, gl.FLOAT, false, 0, 0);
      gl.enableVertexAttribArray(this.aPosLocation);

      gl.bindBuffer(gl.ARRAY_BUFFER, this.colorVertexBuf);
      gl.bufferData(gl.ARRAY_BUFFER, this.colors, gl.STATIC_DRAW);
      gl.vertexAttribPointer(this.aColorLocation, 4, gl.FLOAT, false, 0, 0);
      gl.enableVertexAttribArray(this.aColorLocation);

      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.drawArrays(gl.TRIANGLE_FAN, 0, this.positions.length / 3);
    }
  }
}
