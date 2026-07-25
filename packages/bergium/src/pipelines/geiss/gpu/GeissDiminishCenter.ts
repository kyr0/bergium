import vertexSrc from "./fullscreen.vert.glsl?raw";
import diminishSrc from "./diminish-center.frag.glsl?raw";
import type { WebGLGraphicsDevice, WebGLRenderTarget } from "../../../graphics/WebGLGraphicsDevice.js";
import type { RenderTarget } from "../../../graphics/types.js";
import { linkProgram } from "../../../graphics/gl.js";
import type { DiminishOpts } from "../reference/DiminishCenter.js";

/**
 * GPU Diminish_Center. Copies the source intensity target to the destination
 * target unchanged, decaying the center cross (mode != 12) or the 3px vertical
 * line (mode 12) by `trunc(byte * dwind)`. This is a copy/replace pass (no blend),
 * used as the last step of the effect pass before the warp, matching the CPU
 * `diminishCenter` oracle byte-for-byte.
 */
export class GeissDiminishCenter {
  private readonly program: WebGLProgram;
  private readonly vao: WebGLVertexArrayObject;
  private readonly uniforms: {
    src: WebGLUniformLocation | null;
    apply: WebGLUniformLocation | null;
    mode: WebGLUniformLocation | null;
    cx: WebGLUniformLocation | null;
    cy: WebGLUniformLocation | null;
    cut: WebGLUniformLocation | null;
    h: WebGLUniformLocation | null;
    dwind: WebGLUniformLocation | null;
  };

  public constructor(private readonly device: WebGLGraphicsDevice, private readonly width: number, private readonly height: number) {
    const gl = device.gl;
    this.program = linkProgram(gl, vertexSrc, diminishSrc);
    this.uniforms = {
      src: gl.getUniformLocation(this.program, "uSrc"),
      apply: gl.getUniformLocation(this.program, "uApply"),
      mode: gl.getUniformLocation(this.program, "uMode"),
      cx: gl.getUniformLocation(this.program, "uCenterX"),
      cy: gl.getUniformLocation(this.program, "uCenterY"),
      cut: gl.getUniformLocation(this.program, "uCut"),
      h: gl.getUniformLocation(this.program, "uHeight"),
      dwind: gl.getUniformLocation(this.program, "uDwindle"),
    };
    const vao = gl.createVertexArray();
    if (!vao) throw new Error("Failed to allocate VAO");
    this.vao = vao;
  }

  public render(source: RenderTarget, dest: RenderTarget, o: DiminishOpts): void {
    const gl = this.device.gl;
    gl.useProgram(this.program);
    gl.bindFramebuffer(gl.FRAMEBUFFER, (dest as WebGLRenderTarget).framebuffer);
    gl.viewport(0, 0, this.width, this.height);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, (source as WebGLRenderTarget).texture);
    gl.uniform1i(this.uniforms.src, 0);
    gl.uniform1i(this.uniforms.apply, o.centerDwindle < 0.999 ? 1 : 0);
    gl.uniform1i(this.uniforms.mode, o.mode);
    gl.uniform1i(this.uniforms.cx, o.centerX);
    gl.uniform1i(this.uniforms.cy, o.centerY);
    gl.uniform1i(this.uniforms.cut, o.cut);
    gl.uniform1i(this.uniforms.h, this.height);
    gl.uniform1f(this.uniforms.dwind, o.centerDwindle);

    gl.disable(gl.BLEND);
    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
  }

  public destroy(): void {
    this.device.gl.deleteProgram(this.program);
    this.device.gl.deleteVertexArray(this.vao);
  }
}
