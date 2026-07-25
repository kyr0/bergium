import type { WebGLGraphicsDevice, WebGLRenderTarget } from "../../../graphics/WebGLGraphicsDevice.js";
import type { RGB } from "../reference/Palette.js";
import type { MapTexel } from "../reference/MapField.js";
import type { DiminishOpts } from "../reference/DiminishCenter.js";
import { GeissGpuWarp } from "./GeissGpuWarp.js";
import { GeissInject } from "./GeissInject.js";
import { GeissWaveform, type GpuWaveInput } from "./GeissWaveform.js";
import { GeissDiminishCenter } from "./GeissDiminishCenter.js";
import { GeissPalettePresent } from "./GeissPalettePresent.js";

/** Per-frame inputs for one GPU frame-graph step (the clock advance is CPU-side). */
export interface FrameStepInput {
  /** Additive pre-warp contribution (e.g. effects) into the front buffer, or undefined. */
  preWarp: Uint8Array | undefined;
  /** Additive post-warp contribution (e.g. audio nuclide) into the back buffer, or undefined. */
  postWarp: Uint8Array | undefined;
  /** Waveform to max-blend into the back buffer, or undefined. */
  waveform: GpuWaveInput | undefined;
  diminish: DiminishOpts;
}

/**
 * Assembles the classic frame graph on the GPU over a ping-pong feedback loop
 * (plan normative order): pre-warp injection -> diminishCenter -> warp ->
 * post-warp injection + waveform -> swap. Every pass is byte-exact vs its CPU
 * oracle, so the whole loop stays byte-faithful. Presentation (palette LUT) is
 * applied on demand from the front buffer. All intensity lives in two RGBA8
 * targets plus a diminish temp; nothing is read back to the CPU during stepping.
 */
export class GeissGpuFrameGraph {
  private readonly warp: GeissGpuWarp;
  private readonly inject: GeissInject;
  private readonly waveform: GeissWaveform;
  private readonly diminish: GeissDiminishCenter;
  private readonly present: GeissPalettePresent;
  private readonly front: WebGLRenderTarget;
  private readonly back: WebGLRenderTarget;
  private readonly diminishTemp: WebGLRenderTarget;
  private readonly output: WebGLRenderTarget;
  private readonly contribTex: WebGLTexture;
  private readonly scratchContrib: Uint8Array;
  private frontSlot: 0 | 1 = 0;

  public constructor(
    private readonly device: WebGLGraphicsDevice,
    private readonly width: number,
    private readonly height: number,
  ) {
    this.warp = new GeissGpuWarp(device, width, height);
    this.inject = new GeissInject(device, width, height);
    this.waveform = new GeissWaveform(device, width, height);
    this.diminish = new GeissDiminishCenter(device, width, height);
    this.present = new GeissPalettePresent(device, width, height);
    const mk = (label: string): WebGLRenderTarget =>
      device.createRenderTarget({ label, width, height, format: "rgba8" }) as WebGLRenderTarget;
    this.front = mk("geiss-fb-A");
    this.back = mk("geiss-fb-B");
    this.diminishTemp = mk("geiss-fb-dim");
    this.output = mk("geiss-output");
    this.contribTex = device.createColorTexture(width, height);
    this.scratchContrib = new Uint8Array(width * height * 4);
  }

  public setMap(map: readonly MapTexel[]): void {
    this.warp.setMap(map);
  }

  public setPalette(colors: readonly RGB[]): void {
    this.present.setPalette(colors);
  }

  /** Seed the initial front feedback buffer (raster-order intensity bytes). */
  public seedFront(bytes: Uint8Array): void {
    this.uploadContribution(this.activeFront().texture, bytes);
  }

  /** Render one frame in the normative order, then swap the ping-pong targets. */
  public step(input: FrameStepInput): void {
    const front = this.activeFront();
    const back = this.activeBack();

    if (input.preWarp) {
      this.uploadContribution(this.contribTex, input.preWarp);
      this.inject.inject(front, this.contribTex, "add");
    }
    this.diminish.render(front, this.diminishTemp, input.diminish);
    this.warp.warpTargets(this.diminishTemp, back);
    if (input.postWarp) {
      this.uploadContribution(this.contribTex, input.postWarp);
      this.inject.inject(back, this.contribTex, "add");
    }
    if (input.waveform) this.waveform.render(back, input.waveform);

    this.frontSlot = (this.frontSlot ? 0 : 1) as 0 | 1;
  }

  /** Read the current front intensity as flat bytes (for parity checks). */
  public readFrontRed(): Uint8Array {
    return this.device.readRedChannel(this.activeFront());
  }

  /** Palette-present the front buffer; returns flat RGBA bytes. */
  public presentFrontRgba(): Uint8Array {
    this.present.presentTargets(this.activeFront(), this.output);
    return this.device.readRgba(this.output);
  }

  public destroy(): void {
    this.warp.destroy();
    this.inject.destroy();
    this.waveform.destroy();
    this.diminish.destroy();
    this.present.destroy();
    this.device.gl.deleteTexture(this.contribTex);
    this.device.destroyRenderTarget(this.front);
    this.device.destroyRenderTarget(this.back);
    this.device.destroyRenderTarget(this.diminishTemp);
    this.device.destroyRenderTarget(this.output);
  }

  private activeFront(): WebGLRenderTarget {
    return this.frontSlot === 0 ? this.front : this.back;
  }

  private activeBack(): WebGLRenderTarget {
    return this.frontSlot === 0 ? this.back : this.front;
  }

  private uploadContribution(texture: WebGLTexture, bytes: Uint8Array): void {
    const packed = this.scratchContrib;
    for (let i = 0; i < bytes.length; i++) {
      packed[i * 4] = bytes[i]!;
      packed[i * 4 + 3] = 255;
    }
    this.device.uploadColorTexture(texture, this.width, this.height, packed);
  }
}
