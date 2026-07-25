import { test, expect } from "vitest";
import { WebGLGraphicsDevice, WebGLRenderTarget } from "../../src/graphics/WebGLGraphicsDevice.js";
import { GeissInject } from "../../src/pipelines/geiss/gpu/GeissInject.js";
import { injectMax, injectAdd } from "../../src/pipelines/geiss/reference/FeedbackWarp.js";

/** Pack a flat byte channel into RGBA (red = value, alpha = 255). */
const pack = (vals: Uint8Array): Uint8Array => {
  const out = new Uint8Array(vals.length * 4);
  for (let i = 0; i < vals.length; i++) {
    out[i * 4] = vals[i]!;
    out[i * 4 + 3] = 255;
  }
  return out;
};

/** Deterministic intensity frame + sparse contribution map (zeros = no-op pixels). */
const buildFrames = (W: number, H: number, seed: number) => {
  const intensity = new Uint8Array(W * H);
  const contrib = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) {
    intensity[i] = (i * 37 + seed * 11) & 255;
    contrib[i] = (i % 3 === 0) ? ((i * 53 + seed * 7) & 255) : 0;
  }
  return { intensity, contrib };
};

const runInject = (W: number, H: number, seed: number, mode: "max" | "add"): Uint8Array => {
  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const device = new WebGLGraphicsDevice(canvas);
  const inject = new GeissInject(device, W, H);
  const target = device.createRenderTarget({ label: "intensity", width: W, height: H, format: "rgba8" });
  const contribTex = device.createColorTexture(W, H);
  const { intensity, contrib } = buildFrames(W, H, seed);
  device.uploadColorTexture((target as WebGLRenderTarget).texture, W, H, pack(intensity));
  device.uploadColorTexture(contribTex, W, H, pack(contrib));
  inject.inject(target, contribTex, mode);
  const gpu = device.readRedChannel(target);
  inject.destroy();
  device.destroy();
  return gpu;
};

test("GPU inject (max) matches CPU injectMax byte-for-byte, including zero no-ops", () => {
  for (const seed of [1, 2, 3]) {
    const { intensity, contrib } = buildFrames(64, 48, seed);
    const cpu = Uint8Array.from(intensity);
    for (let i = 0; i < cpu.length; i++) injectMax(cpu, i, contrib[i]!);
    expect(Array.from(runInject(64, 48, seed, "max")), `max seed ${seed}`).toEqual(Array.from(cpu));
  }
});

test("GPU inject (add) matches CPU injectAdd byte-for-byte, including zero no-ops", () => {
  for (const seed of [1, 2, 3]) {
    const { intensity, contrib } = buildFrames(64, 48, seed);
    const cpu = Uint8Array.from(intensity);
    for (let i = 0; i < cpu.length; i++) injectAdd(cpu, i, contrib[i]!);
    expect(Array.from(runInject(64, 48, seed, "add")), `add seed ${seed}`).toEqual(Array.from(cpu));
  }
});
