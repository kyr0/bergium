import type { WebGLGraphicsDevice } from "../../../graphics/WebGLGraphicsDevice.js";
import type { RenderTarget } from "../../../graphics/types.js";
import { waveformCurve, type WaveformGeometry } from "../reference/WaveformRenderer.js";
import { GeissInject } from "./GeissInject.js";

export interface GpuWaveInput extends WaveformGeometry {
  brightness: number;
}

/**
 * GPU rasterization of the six classic waveforms. The trace geometry comes from
 * the shared `waveformCurve` oracle (frame-independent, so it stays on the CPU and
 * avoids any feedback readback); the points are rasterized into a contribution
 * map and max-blended into the intensity target via GeissInject — reproducing
 * renderWave's `plot` (trunc + bounds + injectMax) byte-for-byte. Reusing the
 * verified max-blend primitive keeps this exact rather than depending on GL
 * point-rasterization rules.
 */
export class GeissWaveform {
  private readonly contribTex: WebGLTexture;
  private readonly inject: GeissInject;
  private readonly scratch: Uint8Array;

  public constructor(
    private readonly device: WebGLGraphicsDevice,
    private readonly width: number,
    private readonly height: number,
  ) {
    this.contribTex = device.createColorTexture(width, height);
    this.inject = new GeissInject(device, width, height);
    this.scratch = new Uint8Array(width * height * 4);
  }

  public render(target: RenderTarget, input: GpuWaveInput): void {
    const { width: W, height: H, hideCut, brightness } = input;
    const map = this.scratch;
    map.fill(0);
    for (const [fx, fy] of waveformCurve(input)) {
      const px = Math.trunc(fx);
      const py = Math.trunc(fy);
      if (px >= 0 && px < W && py >= hideCut && py < H - hideCut) {
        const o = (py * W + px) * 4;
        map[o] = brightness; // red = contribution; max-blend is byte-exact to injectMax
      }
    }
    this.device.uploadColorTexture(this.contribTex, W, H, map);
    this.inject.inject(target, this.contribTex, "max");
  }

  public destroy(): void {
    this.device.gl.deleteTexture(this.contribTex);
    this.inject.destroy();
  }
}
