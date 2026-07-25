import { test, expect } from "vitest";
import { warpIntensity8 } from "../../src/pipelines/geiss/reference/FeedbackWarp.js";
import { createPalette } from "../../src/pipelines/geiss/reference/Palette.js";
import { MsvcRandom } from "../../src/pipelines/geiss/reference/MsvcRandom.js";
import type { MapTexel } from "../../src/pipelines/geiss/reference/MapField.js";

/** Matches the ToUint8 semantics of an ImageData Uint8ClampedArray (clamp + round). */
const clampByte = (v: number): number => Math.max(0, Math.min(255, Math.round(v)));

/**
 * Why: the CPU oracle must be observable as actual rendered pixels, not just
 * array values. This warps a source intensity frame, colorizes it with the Geiss
 * palette LUT, rasterizes it to a real 2D canvas in headless Chromium and reads
 * the pixels back — proving the presentation path the 8-bit profile relies on.
 */
test("CPU-oracle intensity + palette render to a 2D canvas and read back exactly", () => {
  const W = 32;
  const H = 24;

  // Source intensity: horizontal ramp 0,8,16,... across each row.
  const src = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) src[y * W + x] = (x * 8) & 255;

  // Identity destination-to-source map with a single byte-dominant tap.
  const map: MapTexel[] = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    map.push({ sourceX: x, sourceY: y, w00: 255, w10: 0, w01: 0, w11: 0 });
  }
  const frame = new Uint8Array(W * H);
  warpIntensity8(src, frame, map, W);

  // Palette LUT is display-time only in the 8-bit profile.
  const { colors } = createPalette(new MsvcRandom(7), 10, false, 1, 1);

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  expect(ctx, "2D canvas context must be available").not.toBeNull();
  if (!ctx) return;

  const img = ctx.createImageData(W, H);
  const expected: number[] = [];
  for (let i = 0; i < W * H; i++) {
    const c = colors[frame[i]!]!;
    img.data[4 * i + 0] = clampByte(c.r);
    img.data[4 * i + 1] = clampByte(c.g);
    img.data[4 * i + 2] = clampByte(c.b);
    img.data[4 * i + 3] = 255;
    expected.push(clampByte(c.r), clampByte(c.g), clampByte(c.b), 255);
  }
  ctx.putImageData(img, 0, 0);

  const read = ctx.getImageData(0, 0, W, H);
  expect(Array.from(read.data)).toEqual(expected);

  // Spot-check that the palette actually drove the colors: intensity 0 -> colors[0].
  expect(Array.from(read.data.slice(0, 4))).toEqual([
    clampByte(colors[0]!.r), clampByte(colors[0]!.g), clampByte(colors[0]!.b), 255,
  ]);
});
