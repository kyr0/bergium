import { test, expect } from "vitest";
import { WebGLGraphicsDevice } from "../../src/graphics/WebGLGraphicsDevice.js";
import { GeissPalettePresent } from "../../src/pipelines/geiss/gpu/GeissPalettePresent.js";
import { GeissGpuWarp } from "../../src/pipelines/geiss/gpu/GeissGpuWarp.js";
import { warpIntensity8 } from "../../src/pipelines/geiss/reference/FeedbackWarp.js";
import { quantizeMapTexel } from "../../src/pipelines/geiss/reference/MapField.js";
import { createMapParameters } from "../../src/pipelines/geiss/reference/MapParameterFactory.js";
import { createPalette } from "../../src/pipelines/geiss/reference/Palette.js";
import { MsvcRandom } from "../../src/pipelines/geiss/reference/MsvcRandom.js";

const NOISE = (): Float32Array => new Float32Array(2345);
const clampByte = (v: number): number => Math.max(0, Math.min(255, Math.round(v)));

/** CPU reference for colorizing an intensity frame through a palette (RGBA bytes). */
const cpuColorize = (intensity: Uint8Array, colors: readonly { r: number; g: number; b: number }[]): number[] => {
  const out: number[] = [];
  for (let i = 0; i < intensity.length; i++) {
    const c = colors[intensity[i]!]!;
    out.push(clampByte(c.r), clampByte(c.g), clampByte(c.b), 255);
  }
  return out;
};

test("GPU palette LUT matches the CPU Palette oracle byte-for-byte", () => {
  const W = 64, H = 48;
  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const device = new WebGLGraphicsDevice(canvas);
  const present = new GeissPalettePresent(device, W, H);
  const { colors } = createPalette(new MsvcRandom(7), 10, false, 1, 1);
  present.setPalette(colors);

  // Intensity ramp cycling 0..255 to exercise the whole LUT.
  const intensity = new Uint8Array(W * H);
  for (let i = 0; i < intensity.length; i++) intensity[i] = i & 255;

  expect(Array.from(present.present(intensity))).toEqual(cpuColorize(intensity, colors));
  present.destroy();
  device.destroy();
});

test("end-to-end: GPU warp -> palette matches CPU warp -> palette", () => {
  const W = 64, H = 48, seed = 2;
  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const device = new WebGLGraphicsDevice(canvas);
  const warp = new GeissGpuWarp(device, W, H);
  const present = new GeissPalettePresent(device, W, H);
  const { colors } = createPalette(new MsvcRandom(5), 10, false, 1, 1);
  present.setPalette(colors);

  const params = createMapParameters(2, W, H, 4, 30, 1, NOISE(), new MsvcRandom(seed));
  const rng = new MsvcRandom(seed * 97 + 1);
  const map = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) map.push(quantizeMapTexel(x, y, params, rng));
  warp.setMap(map);

  const src = new Uint8Array(W * H);
  for (let i = 0; i < src.length; i++) src[i] = (i * 53 + seed * 31) & 255;

  const cpuIntensity = new Uint8Array(W * H);
  warpIntensity8(src, cpuIntensity, map, W);

  // GPU chain: warp (readback) -> palette present.
  const gpuColor = present.present(warp.warp(src));
  expect(Array.from(gpuColor)).toEqual(cpuColorize(cpuIntensity, colors));

  warp.destroy();
  present.destroy();
  device.destroy();
});
