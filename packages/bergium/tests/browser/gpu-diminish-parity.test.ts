import { test, expect } from "vitest";
import { WebGLGraphicsDevice, WebGLRenderTarget } from "../../src/graphics/WebGLGraphicsDevice.js";
import { GeissDiminishCenter } from "../../src/pipelines/geiss/gpu/GeissDiminishCenter.js";
import { diminishCenter } from "../../src/pipelines/geiss/reference/DiminishCenter.js";

const pack = (vals: Uint8Array): Uint8Array => {
  const out = new Uint8Array(vals.length * 4);
  for (let i = 0; i < vals.length; i++) { out[i * 4] = vals[i]!; out[i * 4 + 3] = 255; }
  return out;
};

/**
 * Why: the GPU Diminish_Center (center cross + mode-12 vertical line) must equal
 * the CPU `diminishCenter` oracle byte-for-byte, including the >1 guard and the
 * no-op case. The same intensity frame is diminished on CPU and GPU and compared.
 */
test("GPU Diminish_Center matches CPU diminishCenter (cross, vertical line, no-op)", () => {
  const W = 32, H = 24, cx = 15, cy = 11, cut = 4;

  const cases: Array<{ mode: number; dwind: number; apply: boolean }> = [
    { mode: 3, dwind: 0.99, apply: true },   // center cross
    { mode: 12, dwind: 0.915, apply: true }, // vertical line, no guard
    { mode: 3, dwind: 1.0, apply: false },   // no-op (>= 0.999)
  ];

  for (const { mode, dwind } of cases) {
    const canvas = document.createElement("canvas");
    canvas.width = W; canvas.height = H;
    const device = new WebGLGraphicsDevice(canvas);
    const diminish = new GeissDiminishCenter(device, W, H);

    const intensity = new Uint8Array(W * H);
    for (let i = 0; i < intensity.length; i++) intensity[i] = (i * 29 + 7) & 255;

    // CPU
    const cpu = Uint8Array.from(intensity);
    diminishCenter(cpu, { centerX: cx, centerY: cy, width: W, height: H, cut, centerDwindle: dwind, mode });

    // GPU
    const src = device.createRenderTarget({ label: "src", width: W, height: H, format: "rgba8" });
    const dest = device.createRenderTarget({ label: "dest", width: W, height: H, format: "rgba8" });
    device.uploadColorTexture((src as WebGLRenderTarget).texture, W, H, pack(intensity));
    diminish.render(src, dest, { centerX: cx, centerY: cy, width: W, height: H, cut, centerDwindle: dwind, mode });
    const gpu = device.readRedChannel(dest);
    device.destroyRenderTarget(src);
    device.destroyRenderTarget(dest);
    diminish.destroy();
    device.destroy();

    expect(Array.from(gpu), `mode ${mode} dwind ${dwind}`).toEqual(Array.from(cpu));
  }
});
