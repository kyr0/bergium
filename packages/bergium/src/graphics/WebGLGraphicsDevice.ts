import type { CanvasLike } from "../api/types.js";
import type { GraphicsDevice } from "./GraphicsDevice.js";
import type { RenderTarget, RenderTargetDescriptor } from "./types.js";

/** Concrete render-target handle: a color texture plus its framebuffer. */
export class WebGLRenderTarget implements RenderTarget {
  public constructor(
    public readonly descriptor: Readonly<RenderTargetDescriptor>,
    public readonly texture: WebGLTexture,
    public readonly framebuffer: WebGLFramebuffer,
  ) {}
}

/** Integer (non-renderable) texture formats used for exact byte sampling. */
export type UIntTextureFormat = "rgba8ui" | "rgba16ui";

const CONTEXT_ATTRIBUTES: WebGLContextAttributes = {
  alpha: false,
  antialias: false,
  depth: false,
  stencil: false,
  premultipliedAlpha: false,
  preserveDrawingBuffer: false,
};

/**
 * Owns the single WebGL2 context and every GL object in the engine. Classic
 * intensity is stored in an RGBA8 target whose RED byte is the normative value,
 * because R8UI is not color-renderable in WebGL2 (see plan / classic-warp shader).
 */
export class WebGLGraphicsDevice implements GraphicsDevice {
  public readonly gl: WebGL2RenderingContext;

  public constructor(public readonly canvas: CanvasLike) {
    // Cast through a minimal interface so HTMLCanvasElement / OffscreenCanvas
    // resolve identically under strict DOM typings.
    const anyCanvas = canvas as unknown as {
      getContext(name: "webgl2", opts?: WebGLContextAttributes): WebGL2RenderingContext | null;
    };
    const ctx = anyCanvas.getContext("webgl2", CONTEXT_ATTRIBUTES);
    if (!ctx) throw new Error("WebGL2 is unavailable on the provided canvas");
    this.gl = ctx;
  }

  public createRenderTarget(descriptor: RenderTargetDescriptor): RenderTarget {
    const gl = this.gl;
    const internal = descriptor.format === "rgba16f" ? gl.RGBA16F : gl.RGBA8;
    const texture = gl.createTexture();
    const framebuffer = gl.createFramebuffer();
    if (!texture || !framebuffer) throw new Error("Failed to allocate render-target GL objects");

    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texStorage2D(gl.TEXTURE_2D, 1, internal, descriptor.width, descriptor.height);

    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    if (status !== gl.FRAMEBUFFER_COMPLETE) {
      throw new Error(`Incomplete render target (0x${status.toString(16)}) for format ${descriptor.format}`);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return new WebGLRenderTarget(descriptor, texture, framebuffer);
  }

  public destroyRenderTarget(target: RenderTarget): void {
    const gl = this.gl;
    const handle = target as WebGLRenderTarget;
    gl.deleteTexture(handle.texture);
    gl.deleteFramebuffer(handle.framebuffer);
  }

  public resize(width: number, height: number, _pixelRatio: number): void {
    const surface = this.canvas as unknown as { width: number; height: number };
    surface.width = Math.max(1, Math.trunc(width));
    surface.height = Math.max(1, Math.trunc(height));
  }

  /** Present a target to the visible canvas with a NEAREST blit (intensity-exact). */
  public present(target: RenderTarget): void {
    const gl = this.gl;
    const handle = target as WebGLRenderTarget;
    const surface = this.canvas as unknown as { width: number; height: number };
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, handle.framebuffer);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
    gl.blitFramebuffer(
      0, 0, handle.descriptor.width, handle.descriptor.height,
      0, 0, surface.width, surface.height,
      gl.COLOR_BUFFER_BIT, gl.NEAREST,
    );
  }

  public destroy(): void {
    const ext = this.gl.getExtension("WEBGL_lose_context");
    ext?.loseContext();
  }

  // ---- Classic-profile helpers: integer sampling textures + byte readback ----

  public createUIntTexture(format: UIntTextureFormat, width: number, height: number): WebGLTexture {
    const gl = this.gl;
    const texture = gl.createTexture();
    if (!texture) throw new Error("Failed to allocate integer texture");
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    if (format === "rgba16ui") {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16UI, width, height, 0, gl.RGBA_INTEGER, gl.UNSIGNED_SHORT, null);
    } else {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8UI, width, height, 0, gl.RGBA_INTEGER, gl.UNSIGNED_BYTE, null);
    }
    return texture;
  }

  public uploadUIntTexture(
    texture: WebGLTexture,
    format: UIntTextureFormat,
    width: number,
    height: number,
    data: ArrayBufferView,
  ): void {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    const type = format === "rgba16ui" ? gl.UNSIGNED_SHORT : gl.UNSIGNED_BYTE;
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, width, height, gl.RGBA_INTEGER, type, data);
  }

  /** Read the red channel of an RGBA8 target back as a flat Uint8Array (w*h). */
  public readRedChannel(target: RenderTarget): Uint8Array {
    const gl = this.gl;
    const handle = target as WebGLRenderTarget;
    const { width, height } = handle.descriptor;
    const packed = new Uint8Array(width * height * 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, handle.framebuffer);
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, packed);
    const red = new Uint8Array(width * height);
    for (let i = 0; i < red.length; i++) red[i] = packed[i * 4]!;
    return red;
  }

  /** Create a normalized, NEAREST RGBA8 texture for color/presentation sampling. */
  public createColorTexture(width: number, height: number): WebGLTexture {
    const gl = this.gl;
    const texture = gl.createTexture();
    if (!texture) throw new Error("Failed to allocate color texture");
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, width, height);
    return texture;
  }

  public uploadColorTexture(texture: WebGLTexture, width: number, height: number, data: ArrayBufferView): void {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, data);
  }

  /** Read a full RGBA8 target back as a flat Uint8Array (width*height*4). */
  public readRgba(target: RenderTarget): Uint8Array {
    const gl = this.gl;
    const handle = target as WebGLRenderTarget;
    const { width, height } = handle.descriptor;
    const out = new Uint8Array(width * height * 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, handle.framebuffer);
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, out);
    return out;
  }
}
