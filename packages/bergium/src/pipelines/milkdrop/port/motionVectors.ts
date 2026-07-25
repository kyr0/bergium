import ShaderUtils from "./shaderUtils.js";

/**
 * MotionVectors - the MilkDrop motion-vector grid overlay.
 *
 * Mechanical TypeScript port of vendor/butterchurn/src/rendering/motionVectors/motionVectors.js
 * (pinned revision fbac2f6). Computes per-cell motion direction by bilinearly
 * sampling the warp UV field, then draws them as GL_LINES. Shader strings frozen.
 */

export interface MotionVectorsOpts {
  texsizeX: number;
  texsizeY: number;
  mesh_width: number;
  mesh_height: number;
}

export default class MotionVectors {
  private gl: WebGL2RenderingContext;
  private readonly maxX = 64;
  private readonly maxY = 48;
  private positions: Float32Array;
  private texsizeX: number;
  // Faithful dead state: assigned in vendored source, never read; kept verbatim for honest 1:1 parity.
  private texsizeY: number;
  private mesh_width: number;
  private mesh_height: number;
  private positionVertexBuf: WebGLBuffer;
  private floatPrecision: string;
  private shaderProgram!: WebGLProgram;
  private aPosLoc!: number;
  private colorLoc!: WebGLUniformLocation | null;
  private numVecVerts = 0;
  private color: number[] = [];

  public constructor(gl: WebGL2RenderingContext, opts: MotionVectorsOpts) {
    this.gl = gl;
    this.positions = new Float32Array(this.maxX * this.maxY * 2 * 3);
    this.texsizeX = opts.texsizeX;
    this.texsizeY = opts.texsizeY;
    this.mesh_width = opts.mesh_width;
    this.mesh_height = opts.mesh_height;
    this.positionVertexBuf = gl.createBuffer()!;
    this.floatPrecision = ShaderUtils.getFragmentFloatPrecision(gl);
    this.createShader();
  }

  public updateGlobals(opts: MotionVectorsOpts): void {
    this.texsizeX = opts.texsizeX;
    this.texsizeY = opts.texsizeY;
    this.mesh_width = opts.mesh_width;
    this.mesh_height = opts.mesh_height;
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

  public getMotionDir(warpUVs: Float32Array, fx: number, fy: number): [number, number] {
    const y0 = Math.floor(fy * this.mesh_height);
    const dy = fy * this.mesh_height - y0;
    const x0 = Math.floor(fx * this.mesh_width);
    const dx = fx * this.mesh_width - x0;
    const x1 = x0 + 1;
    const y1 = y0 + 1;
    const gridX1 = this.mesh_width + 1;

    let fx2 = warpUVs[(y0 * gridX1 + x0) * 2 + 0]! * (1 - dx) * (1 - dy);
    let fy2 = warpUVs[(y0 * gridX1 + x0) * 2 + 1]! * (1 - dx) * (1 - dy);
    fx2 += warpUVs[(y0 * gridX1 + x1) * 2 + 0]! * dx * (1 - dy);
    fy2 += warpUVs[(y0 * gridX1 + x1) * 2 + 1]! * dx * (1 - dy);
    fx2 += warpUVs[(y1 * gridX1 + x0) * 2 + 0]! * (1 - dx) * dy;
    fy2 += warpUVs[(y1 * gridX1 + x0) * 2 + 1]! * (1 - dx) * dy;
    fx2 += warpUVs[(y1 * gridX1 + x1) * 2 + 0]! * dx * dy;
    fy2 += warpUVs[(y1 * gridX1 + x1) * 2 + 1]! * dx * dy;

    return [fx2, 1.0 - fy2];
  }

  public generateMotionVectors(mdVSFrame: Record<string, unknown>, warpUVs: Float32Array): boolean {
    const mv = mdVSFrame as unknown as {
      bmotionvectorson: number; mv_a: number; mv_x: number; mv_y: number;
      mv_dx: number; mv_dy: number; mv_l: number; mv_r: number; mv_g: number; mv_b: number;
    };
    const mvOn = mv.bmotionvectorson ?? 0;
    const mvA = mvOn === 0 ? 0 : (mv.mv_a ?? 0);
    let nX = Math.floor(mv.mv_x);
    let nY = Math.floor(mv.mv_y);

    if (mvA > 0.001 && nX > 0 && nY > 0) {
      let dx = mv.mv_x - nX;
      let dy = mv.mv_y - nY;

      if (nX > this.maxX) { nX = this.maxX; dx = 0; }
      if (nY > this.maxY) { nY = this.maxY; dy = 0; }

      const dx2 = mv.mv_dx;
      const dy2 = mv.mv_dy;
      const lenMult = mv.mv_l;
      const minLen = 1.0 / this.texsizeX;

      this.numVecVerts = 0;
      for (let j = 0; j < nY; j++) {
        let fy = (j + 0.25) / (nY + dy + 0.25 - 1.0);
        fy -= dy2;
        if (fy > 0.0001 && fy < 0.9999) {
          for (let i = 0; i < nX; i++) {
            let fx = (i + 0.25) / (nX + dx + 0.25 - 1.0);
            fx += dx2;
            if (fx > 0.0001 && fx < 0.9999) {
              const dir = this.getMotionDir(warpUVs, fx, fy);
              let fx2 = dir[0];
              let fy2 = dir[1];
              let dxi = fx2 - fx;
              let dyi = fy2 - fy;
              dxi *= lenMult;
              dyi *= lenMult;
              const fdist = Math.sqrt(dxi * dxi + dyi * dyi);
              if (fdist < minLen && fdist > 0.00000001) {
                const scale = minLen / fdist;
                dxi *= scale;
                dyi *= scale;
              } else {
                dxi = minLen;
                dyi = minLen; // vendored duplicates `dxi = minLen` (bug preserved)
              }
              fx2 = fx + dxi;
              fy2 = fy + dyi;
              const vx1 = 2.0 * fx - 1.0;
              const vy1 = 2.0 * fy - 1.0;
              const vx2 = 2.0 * fx2 - 1.0;
              const vy2 = 2.0 * fy2 - 1.0;
              this.positions[this.numVecVerts * 3 + 0] = vx1;
              this.positions[this.numVecVerts * 3 + 1] = vy1;
              this.positions[this.numVecVerts * 3 + 2] = 0;
              this.positions[(this.numVecVerts + 1) * 3 + 0] = vx2;
              this.positions[(this.numVecVerts + 1) * 3 + 1] = vy2;
              this.positions[(this.numVecVerts + 1) * 3 + 2] = 0;
              this.numVecVerts += 2;
            }
          }
        }
      }
      if (this.numVecVerts > 0) {
        this.color = [mv.mv_r ?? 0, mv.mv_g ?? 0, mv.mv_b ?? 0, mvA];
        return true;
      }
    }
    return false;
  }

  public drawMotionVectors(mdVSFrame: Record<string, unknown>, warpUVs: Float32Array): void {
    if (this.generateMotionVectors(mdVSFrame, warpUVs)) {
      const gl = this.gl;
      gl.useProgram(this.shaderProgram);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.positionVertexBuf);
      gl.bufferData(gl.ARRAY_BUFFER, this.positions, gl.STATIC_DRAW);
      gl.vertexAttribPointer(this.aPosLoc, 3, gl.FLOAT, false, 0, 0);
      gl.enableVertexAttribArray(this.aPosLoc);
      gl.uniform4fv(this.colorLoc, this.color);
      gl.lineWidth(1);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.drawArrays(gl.LINES, 0, this.numVecVerts);
    }
  }
}
