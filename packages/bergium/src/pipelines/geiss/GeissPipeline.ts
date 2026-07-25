import type { BergiumPreset } from "../../presets/types.js";
import type { RenderSize, RenderTarget } from "../../graphics/types.js";
import type { RendererPipeline, RenderFrame, SimulationFrame } from "../types.js";

/**
 * GPU adapter around the reference oracles in ./reference. Resource setup is
 * intentionally absent, but the implementation seam is final:
 *
 * simulate: choose/activate mode -> analyze source-domain audio -> update emitters
 * render: pre-warp effects -> integer warp -> audio nuclide -> waveform -> swap
 * present: palette LUT (8-bit profile) -> compositor target
 *
 * Do not encode classic state in the generic 3D preset operators.
 */
export class GeissPipeline implements RendererPipeline<BergiumPreset> {
  public readonly id = "geiss";

  public loadPreset(_preset: BergiumPreset, _transitionSeconds: number): void { }
  public resize(_size: RenderSize): void { }
  public simulate(_frame: SimulationFrame): void { }

  public render(_frame: RenderFrame, _target: RenderTarget): void {
    // Backend implementation binds pipeline-owned ping-pong FBOs and executes
    // GeissFrameGraph's order. It then colorizes/copies into _target; it never
    // binds the default framebuffer. The exact map pass is the GPU warp in
    // ./gpu/GeissGpuWarp.ts (classic-warp-rgba8.frag.glsl); integer/map injection,
    // waveform and palette-LUT presentation passes remain to be added.
  }

  public destroy(): void { }
}
