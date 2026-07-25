import vertexSrc from "./fullscreen.vert.glsl?raw";
import warpSrc from "./classic-warp-rgba8.frag.glsl?raw";
import type { WebGLGraphicsDevice, WebGLRenderTarget } from "../../../graphics/WebGLGraphicsDevice.js";
import { linkProgram } from "../../../graphics/gl.js";
import type { MapTexel } from "../reference/MapField.js";

/**
 * GPU integer feedback warp = the exact classic map pass. It MUST reproduce
 * FeedbackWarp.warpIntensity8 byte-for-byte; the shader's flat-indexed taps mirror
 * the CPU's linear framebuffer reads. Feedback is a normalized RGBA8 texture so
 * this pass can chain directly from the ping-pong/diminish targets without a
 * readback. Owns its program, source/map textures and destination target, but
 * never the GL context (owned by the device).
 */
export class GeissGpuWarp {
  private readonly program: WebGLProgram;
  private readonly feedbackTex: WebGLTexture;
  private readonly mapBaseTex: WebGLTexture;
  private readonly mapWeightsTex: WebGLTexture;
  private readonly dest: WebGLRenderTarget;
  private readonly vao: WebGLVertexArrayObject;
  private readonly uniforms: { feedback: WebGLUniformLocation | null; base: WebGLUniformLocation | null; weights: WebGLUniformLocation | null; width: WebGLUniformLocation | null };
  private readonly scratchSrc: Uint8Array;
  private readonly scratchWeights: Uint8Array;
  private readonly scratchBase: Uint16Array;

  public constructor(
    private readonly device: WebGLGraphicsDevice,
    private readonly width: number,
    private readonly height: number,
  ) {
    const gl = device.gl;
    this.program = linkProgram(gl, vertexSrc, warpSrc);
    this.uniforms = {
      feedback: gl.getUniformLocation(this.program, "uFeedback"),
      base: gl.getUniformLocation(this.program, "uMapBase"),
      weights: gl.getUniformLocation(this.program, "uMapWeights"),
      width: gl.getUniformLocation(this.program, "uWidth"),
    };
    this.feedbackTex = device.createColorTexture(width, height);
    this.mapBaseTex = device.createUIntTexture("rgba16ui", width, height);
    this.mapWeightsTex = device.createUIntTexture("rgba8ui", width, height);
    this.dest = device.createRenderTarget({ label: "geiss-warp", width, height, format: "rgba8" }) as WebGLRenderTarget;
    const vao = gl.createVertexArray();
    if (!vao) throw new Error("Failed to allocate VAO");
    this.vao = vao;
    this.scratchSrc = new Uint8Array(width * height * 4);
    this.scratchWeights = new Uint8Array(width * height * 4);
    this.scratchBase = new Uint16Array(width * height * 4);
  }

  /** Upload a destination-to-source map produced by the CPU oracle (raster order). */
  public setMap(map: readonly MapTexel[]): void {
    if (map.length !== this.width * this.height) {
      throw new Error(`Map length ${map.length} does not match ${this.width}x${this.height}`);
    }
    const weights = this.scratchWeights;
    const base = this.scratchBase;
    for (let i = 0; i < map.length; i++) {
      const m = map[i]!;
      weights[i * 4] = m.w00; weights[i * 4 + 1] = m.w10; weights[i * 4 + 2] = m.w01; weights[i * 4 + 3] = m.w11;
      base[i * 4] = m.sourceX; base[i * 4 + 1] = m.sourceY; base[i * 4 + 2] = 0; base[i * 4 + 3] = 0;
    }
    this.device.uploadUIntTexture(this.mapBaseTex, "rgba16ui", this.width, this.height, base);
    this.device.uploadUIntTexture(this.mapWeightsTex, "rgba8ui", this.width, this.height, weights);
  }

  private bindCommon(sourceTexture: WebGLTexture, destFb: WebGLFramebuffer): void {
    const gl = this.device.gl;
    gl.useProgram(this.program);
    gl.bindFramebuffer(gl.FRAMEBUFFER, destFb);
    gl.viewport(0, 0, this.width, this.height);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, sourceTexture);
    gl.uniform1i(this.uniforms.feedback, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.mapBaseTex);
    gl.uniform1i(this.uniforms.base, 1);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.mapWeightsTex);
    gl.uniform1i(this.uniforms.weights, 2);
    gl.uniform1i(this.uniforms.width, this.width);
    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
  }

  /** Warp a flat source intensity frame (uploaded); returns the flat destination. */
  public warp(source: Uint8Array): Uint8Array {
    if (source.length !== this.width * this.height) {
      throw new Error(`Source length ${source.length} does not match ${this.width}x${this.height}`);
    }
    const packed = this.scratchSrc;
    for (let i = 0; i < source.length; i++) {
      packed[i * 4] = source[i]!;
      packed[i * 4 + 1] = 0;
      packed[i * 4 + 2] = 0;
      packed[i * 4 + 3] = 255;
    }
    this.device.uploadColorTexture(this.feedbackTex, this.width, this.height, packed);
    this.bindCommon(this.feedbackTex, this.dest.framebuffer);
    return this.device.readRedChannel(this.dest);
  }

  /** GPU-only warp from a source render target into a destination target (no readback). */
  public warpTargets(source: WebGLRenderTarget, dest: WebGLRenderTarget): void {
    this.bindCommon(source.texture, dest.framebuffer);
  }

  public destroy(): void {
    const gl = this.device.gl;
    gl.deleteProgram(this.program);
    gl.deleteVertexArray(this.vao);
    gl.deleteTexture(this.feedbackTex);
    gl.deleteTexture(this.mapBaseTex);
    gl.deleteTexture(this.mapWeightsTex);
    this.device.destroyRenderTarget(this.dest);
  }
}
