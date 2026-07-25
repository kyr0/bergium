import type { CanvasLike } from "../api/types.js";
import type { RenderTarget, RenderTargetDescriptor } from "./types.js";

/** Owns the only WebGL2 context and all GPU resource creation. */
export interface GraphicsDevice {
  readonly canvas: CanvasLike;
  readonly gl: WebGL2RenderingContext;
  createRenderTarget(descriptor: RenderTargetDescriptor): RenderTarget;
  destroyRenderTarget(target: RenderTarget): void;
  resize(width: number, height: number, pixelRatio: number): void;
  present(target: RenderTarget): void;
  destroy(): void;
}

