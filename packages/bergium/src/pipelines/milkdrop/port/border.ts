import ShaderUtils from "./shaderUtils.js";

/**
 * Border — the inner/outer border sprite (4-sided frame via 8 triangles).
 *
 * Mechanical TypeScript port of vendor/butterchurn/src/rendering/sprites/border.js
 * (pinned revision fbac2f6). Shader strings are frozen assets.
 */

export interface BorderOpts {
  aspectx: number;
  aspecty: number;
}

type Vec3 = [number, number, number];

export default class Border {
  private gl: WebGL2RenderingContext;
  private positions: Float32Array;
  private aspectx: number;
  private aspecty: number;
  // Faithful dead state: assigned in vendored source, never read; kept verbatim for honest 1:1 parity.
  private invAspectx: number;
  private invAspecty: number;
  private floatPrecision: string;
  private shaderProgram!: WebGLProgram;
  private aPosLoc!: number;
  private colorLoc!: WebGLUniformLocation | null;
  private vertexBuf: WebGLBuffer;

  public constructor(gl: WebGL2RenderingContext, opts: BorderOpts) {
    this.gl = gl;
    this.positions = new Float32Array(72);
    this.aspectx = opts.aspectx;
    this.aspecty = opts.aspecty;
    this.invAspectx = 1.0 / this.aspectx;
    this.invAspecty = 1.0 / this.aspecty;
    this.floatPrecision = ShaderUtils.getFragmentFloatPrecision(gl);
    this.createShader();
    this.vertexBuf = gl.createBuffer()!;
  }

  public updateGlobals(opts: BorderOpts): void {
    this.aspectx = opts.aspectx;
    this.aspecty = opts.aspecty;
    this.invAspectx = 1.0 / this.aspectx;
    this.invAspecty = 1.0 / this.aspecty;
  }

  private createShader(): void {
    const gl = this.gl;
    this.shaderProgram = gl.createProgram()!;
    const vertShader = gl.createShader(gl.VERTEX_SHADER)!;
    gl.shaderSource(vertShader,
      `#version 300 es
       in vec3 aPos;
       void main(void) {
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
       out vec4 fragColor;
       uniform vec4 u_color;
       void main(void) {
         fragColor = u_color;
       }`.trim(),
    );
    gl.compileShader(fragShader);
    gl.attachShader(this.shaderProgram, vertShader);
    gl.attachShader(this.shaderProgram, fragShader);
    gl.linkProgram(this.shaderProgram);
    this.aPosLoc = gl.getAttribLocation(this.shaderProgram, "aPos");
    this.colorLoc = gl.getUniformLocation(this.shaderProgram, "u_color");
  }

  private addTriangle(offset: number, p1: Vec3, p2: Vec3, p3: Vec3): void {
    this.positions[offset + 0] = p1[0];
    this.positions[offset + 1] = p1[1];
    this.positions[offset + 2] = p1[2];
    this.positions[offset + 3] = p2[0];
    this.positions[offset + 4] = p2[1];
    this.positions[offset + 5] = p2[2];
    this.positions[offset + 6] = p3[0];
    this.positions[offset + 7] = p3[1];
    this.positions[offset + 8] = p3[2];
  }

  public generateBorder(borderColor: ArrayLike<number>, borderSize: number, prevBorderSize: number): boolean {
    if (borderSize > 0 && borderColor[3]! > 0) {
      const width = 2;
      const height = 2;
      const widthHalf = width / 2;
      const heightHalf = height / 2;
      const prevBorderWidth = prevBorderSize / 2;
      const borderWidth = borderSize / 2 + prevBorderWidth;
      const prevBorderWidthWidth = prevBorderWidth * width;
      const prevBorderWidthHeight = prevBorderWidth * height;
      const borderWidthWidth = borderWidth * width;
      const borderWidthHeight = borderWidth * height;

      // 1st side
      let p1: Vec3 = [-widthHalf + prevBorderWidthWidth, -heightHalf + borderWidthHeight, 0];
      let p2: Vec3 = [-widthHalf + prevBorderWidthWidth, heightHalf - borderWidthHeight, 0];
      let p3: Vec3 = [-widthHalf + borderWidthWidth, heightHalf - borderWidthHeight, 0];
      let p4: Vec3 = [-widthHalf + borderWidthWidth, -heightHalf + borderWidthHeight, 0];
      this.addTriangle(0, p4, p2, p1);
      this.addTriangle(9, p4, p3, p2);

      // 2nd side
      p1 = [widthHalf - prevBorderWidthWidth, -heightHalf + borderWidthHeight, 0];
      p2 = [widthHalf - prevBorderWidthWidth, heightHalf - borderWidthHeight, 0];
      p3 = [widthHalf - borderWidthWidth, heightHalf - borderWidthHeight, 0];
      p4 = [widthHalf - borderWidthWidth, -heightHalf + borderWidthHeight, 0];
      this.addTriangle(18, p1, p2, p4);
      this.addTriangle(27, p2, p3, p4);

      // Top
      p1 = [-widthHalf + prevBorderWidthWidth, -heightHalf + prevBorderWidthHeight, 0];
      p2 = [-widthHalf + prevBorderWidthWidth, borderWidthHeight - heightHalf, 0];
      p3 = [widthHalf - prevBorderWidthWidth, borderWidthHeight - heightHalf, 0];
      p4 = [widthHalf - prevBorderWidthWidth, -heightHalf + prevBorderWidthHeight, 0];
      this.addTriangle(36, p4, p2, p1);
      this.addTriangle(45, p4, p3, p2);

      // Bottom
      p1 = [-widthHalf + prevBorderWidthWidth, heightHalf - prevBorderWidthHeight, 0];
      p2 = [-widthHalf + prevBorderWidthWidth, heightHalf - borderWidthHeight, 0];
      p3 = [widthHalf - prevBorderWidthWidth, heightHalf - borderWidthHeight, 0];
      p4 = [widthHalf - prevBorderWidthWidth, heightHalf - prevBorderWidthHeight, 0];
      this.addTriangle(54, p1, p2, p4);
      this.addTriangle(63, p2, p3, p4);

      return true;
    }
    return false;
  }

  public drawBorder(borderColor: ArrayLike<number>, borderSize: number, prevBorderSize: number): void {
    if (this.generateBorder(borderColor, borderSize, prevBorderSize)) {
      const gl = this.gl;
      gl.useProgram(this.shaderProgram);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuf);
      gl.bufferData(gl.ARRAY_BUFFER, this.positions, gl.STATIC_DRAW);
      gl.vertexAttribPointer(this.aPosLoc, 3, gl.FLOAT, false, 0, 0);
      gl.enableVertexAttribArray(this.aPosLoc);
      gl.uniform4fv(this.colorLoc, borderColor as Float32List);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.drawArrays(gl.TRIANGLES, 0, this.positions.length / 3);
    }
  }
}
