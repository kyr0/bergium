import type { RenderFrame } from "../pipelines/types.js";
import type { RenderTarget } from "../graphics/types.js";

export interface CompositionInput {
  target: RenderTarget;
  opacity: number;
}

/** Owns transitions, output post-FX, overlay text, and final presentation. */
export interface Compositor {
  compose(frame: RenderFrame, inputs: readonly CompositionInput[], output: RenderTarget): void;
  destroy(): void;
}

