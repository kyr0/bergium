import type { TextOptions } from "../api/types.js";
import type { RenderTarget } from "../graphics/types.js";
import type { RenderFrame } from "../pipelines/types.js";

/** Canvas2D texture cache first; MSDF remains an optional later backend. */
export interface TextRenderer {
  enqueue(options: TextOptions): void;
  render(frame: RenderFrame, target: RenderTarget, layer: "feedback" | "overlay"): void;
  destroy(): void;
}

