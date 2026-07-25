import vertexSrc from "./fullscreen.vert.glsl?raw";
import paletteSrc from "./palette-lut.frag.glsl?raw";
import type { WebGLGraphicsDevice, WebGLRenderTarget } from "../../../graphics/WebGLGraphicsDevice.js";
import { linkProgram } from "../../../graphics/gl.js";
import type { RGB } from "../reference/Palette.js";

/** Clamp to a byte the way an RGBA8UI texture stores it (round + clamp 0..255). */
const clampByte = (v: number): number => Math.max(0, Math.min(255, Math.round(v)));

/**
 * 8-bit profile presentation pass: colorize a scalar intensity frame through the
 * 256-entry palette LUT. This is the display-time colorization the compositor
 * invokes; palette colors are NEVER fed back into the scalar feedback buffer. The
 * intensity source is a normalized RGBA8 texture so it can consume the warp pass's
 * RGBA8 output directly.
 */
export class GeissPalettePresent {
  private readonly program: WebGLProgram;
  private readonly intensityTex: WebGLTexture;
  private readonly lutTex: WebGLTexture;
  private readonly dest: WebGLRenderTarget;
  private readonly vao: WebGLVertexArrayObject;
  private readonly uniforms: { intensity: WebGLUniformLocation | null; lut: WebGLUniformLocation | null };
  private readonly scratchIntensity: Uint8Array;
  private readonly scratchLut: Uint8Array;

  public constructor(
    private readonly device: WebGLGraphicsDevice,
    private readonly width: number,
    private readonly height: number,
  ) {
    const gl = device.gl;
    this.program = linkProgram(gl, vertexSrc, paletteSrc);
    this.uniforms = {
      intensity: gl.getUniformLocation(this.program, "uIntensity"),
      lut: gl.getUniformLocation(this.program, "uLut"),
    };
    this.intensityTex = device.createColorTexture(width, height);
    this.lutTex = device.createUIntTexture("rgba8ui", 256, 1);
    this.dest = device.createRenderTarget({ label: "geiss-palette", width, height, format: "rgba8" }) as WebGLRenderTarget;
    const vao = gl.createVertexArray();
    if (!vao) throw new Error("Failed to allocate VAO");
    this.vao = vao;
    this.scratchIntensity = new Uint8Array(width * height * 4);
    this.scratchLut = new Uint8Array(256 * 4);
  }

  /** Upload the 256-entry palette (display-time only). */
  public setPalette(colors: readonly RGB[]): void {
    if (colors.length !== 256) throw new Error(`Palette must have 256 entries, got ${colors.length}`);
    const lut = this.scratchLut;
    for (let i = 0; i < 256; i++) {
      const c = colors[i]!;
      lut[i * 4] = clampByte(c.r);
      lut[i * 4 + 1] = clampByte(c.g);
      lut[i * 4 + 2] = clampByte(c.b);
      lut[i * 4 + 3] = 255;
    }
    this.device.uploadUIntTexture(this.lutTex, "rgba8ui", 256, 1, lut);
  }

  private bindCommon(sourceTexture: WebGLTexture, destFb: WebGLFramebuffer): void {
    const gl = this.device.gl;
    gl.useProgram(this.program);
    gl.bindFramebuffer(gl.FRAMEBUFFER, destFb);
    gl.viewport(0, 0, this.width, this.height);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, sourceTexture);
    gl.uniform1i(this.uniforms.intensity, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.lutTex);
    gl.uniform1i(this.uniforms.lut, 1);
    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
  }

  /** Colorize a flat intensity frame; returns flat RGBA bytes (width*height*4). */
  public present(intensity: Uint8Array): Uint8Array {
    if (intensity.length !== this.width * this.height) {
      throw new Error(`Intensity length ${intensity.length} does not match ${this.width}x${this.height}`);
    }
    const packed = this.scratchIntensity;
    for (let i = 0; i < intensity.length; i++) {
      packed[i * 4] = intensity[i]!;
      packed[i * 4 + 1] = 0;
      packed[i * 4 + 2] = 0;
      packed[i * 4 + 3] = 255;
    }
    this.device.uploadColorTexture(this.intensityTex, this.width, this.height, packed);
    this.bindCommon(this.intensityTex, this.dest.framebuffer);
    return this.device.readRgba(this.dest);
  }

  /** GPU-only palette pass from a source target into a destination target (RGBA). */
  public presentTargets(source: WebGLRenderTarget, dest: WebGLRenderTarget): void {
    this.bindCommon(source.texture, dest.framebuffer);
  }

  public destroy(): void {
    const gl = this.device.gl;
    gl.deleteProgram(this.program);
    gl.deleteVertexArray(this.vao);
    gl.deleteTexture(this.intensityTex);
    gl.deleteTexture(this.lutTex);
    this.device.destroyRenderTarget(this.dest);
  }
}
