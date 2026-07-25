import vertexSrc from "./fullscreen.vert.glsl?raw";
import injectSrc from "./inject.frag.glsl?raw";
import type { WebGLGraphicsDevice, WebGLRenderTarget } from "../../../graphics/WebGLGraphicsDevice.js";
import type { RenderTarget } from "../../../graphics/types.js";
import { linkProgram } from "../../../graphics/gl.js";

export type InjectMode = "max" | "add";

/**
 * Pre/post-warp integer injection. The classic effects and waveform write into the
 * feedback buffer with two rules - max-blend (waveform/dots) and saturating add
 * (nuclide/solar) - which map directly to GL `MAX` and additive blending into the
 * intensity target. The contribution is supplied as a red-byte texture (effects
 * rasterize into it; this pass performs the blended write). For ordered writes that
 * depend on each other, call this once per order (plan: "require an intermediate
 * pass").
 */
export class GeissInject {
  private readonly program: WebGLProgram;
  private readonly vao: WebGLVertexArrayObject;
  private readonly uContrib: WebGLUniformLocation | null;

  public constructor(
    private readonly device: WebGLGraphicsDevice,
    private readonly width: number,
    private readonly height: number,
  ) {
    const gl = device.gl;
    this.program = linkProgram(gl, vertexSrc, injectSrc);
    this.uContrib = gl.getUniformLocation(this.program, "uContrib");
    const vao = gl.createVertexArray();
    if (!vao) throw new Error("Failed to allocate VAO");
    this.vao = vao;
  }

  /** Blend a per-pixel red-byte contribution into the intensity target in place. */
  public inject(target: RenderTarget, contribution: WebGLTexture, mode: InjectMode): void {
    const gl = this.device.gl;
    const rt = target as WebGLRenderTarget;
    gl.useProgram(this.program);
    gl.bindFramebuffer(gl.FRAMEBUFFER, rt.framebuffer);
    gl.viewport(0, 0, this.width, this.height);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, contribution);
    gl.uniform1i(this.uContrib, 0);

    gl.enable(gl.BLEND);
    // MAX ignores the blend function; additive uses src+dst clamped by the framebuffer.
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.blendEquation(mode === "max" ? gl.MAX : gl.FUNC_ADD);

    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
    gl.disable(gl.BLEND);
  }

  public destroy(): void {
    const gl = this.device.gl;
    gl.deleteProgram(this.program);
    gl.deleteVertexArray(this.vao);
  }
}
