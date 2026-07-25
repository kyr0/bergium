import { test, expect } from "vitest";
import { GeissGpuFrameGraph } from "../../src/pipelines/geiss/gpu/GeissGpuFrameGraph.js";
import { WebGLGraphicsDevice } from "../../src/graphics/WebGLGraphicsDevice.js";
import { createPalette } from "../../src/pipelines/geiss/reference/Palette.js";
import { createMapParameters } from "../../src/pipelines/geiss/reference/MapParameterFactory.js";
import { quantizeMapTexel } from "../../src/pipelines/geiss/reference/MapField.js";
import { MsvcRandom } from "../../src/pipelines/geiss/reference/MsvcRandom.js";
import type { FrameStepInput } from "../../src/pipelines/geiss/gpu/GeissGpuFrameGraph.js";

const W = 320, H = 240;

/** Deterministic random source seeded for reproducibility. */
const rng = new MsvcRandom(42);

/** Build a full MapTexel[] from a MapParameters. */
const buildMap = (params: ReturnType<typeof createMapParameters>): import("../../src/pipelines/geiss/reference/MapField.js").MapTexel[] => {
  const map: import("../../src/pipelines/geiss/reference/MapField.js").MapTexel[] = new Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    map[y * W + x] = quantizeMapTexel(x, y, params, rng);
  }
  return map;
};

/** A minimal FrameStepInput with all optional fields undefined (effects only). */
const zeroStep = (): FrameStepInput => ({
  preWarp: undefined,
  postWarp: undefined,
  waveform: undefined,
  diminish: { shade: 0, chasers: 0, bar: 0, dots: 0, nuclide: 0, grid: 0, solar: 0, diminishCenter: 0 },
});

/** Coarse average-RGB signature for snapshot comparison. */
const signature = (data: Uint8Array, gw: number, gh: number): number[] => {
  const sig: number[] = [];
  for (let by = 0; by < gh; by++) {
    for (let bx = 0; bx < gw; bx++) {
      const x0 = Math.floor((bx * W) / gw), x1 = Math.floor(((bx + 1) * W) / gw);
      const y0 = Math.floor((by * H) / gh), y1 = Math.floor(((by + 1) * H) / gh);
      let r = 0, g = 0, b = 0, n = 0;
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
        const o = (y * W + x) * 4;
        r += data[o]!; g += data[o + 1]!; b += data[o + 2]!; n++;
      }
      sig.push(n ? Math.round(r / n) : 0, n ? Math.round(g / n) : 0, n ? Math.round(b / n) : 0);
    }
  }
  return sig;
};

/**
 * Why: verifies the full Geiss GPU pipeline (GeissGpuFrameGraph) renders to a
 * WebGLRenderTarget via WebGLGraphicsDevice, exercising:
 *   GeissGpuWarp + GeissInject + GeissDiminishCenter + GeissPalettePresent
 *
 * Uses deterministic RNG seed and a fixed map to produce reproducible output.
 * Renders 30 frames and:
 * (1) asserts non-blank output after warmup,
 * (2) asserts the output evolves across frames (animation),
 * (3) captures a coarse golden snapshot for regression tracking.
 */
test("GeissGpuFrameGraph: renders, non-blank + animating, golden snapshot", () => {
  // --- WebGL device + GPU frame graph ---
  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const device = new WebGLGraphicsDevice(canvas);
  const graph = new GeissGpuFrameGraph(device, W, H);

  // --- Deterministic preset: palette + map ---
  const { colors } = createPalette(rng, 10, false, 1, 1);
  graph.setPalette(colors);

  const mapParams = createMapParameters(1, W, H, 0, 60, 0.98, new Float32Array(512), rng);
  const map = buildMap(mapParams);
  graph.setMap(map);

  // Seed the front buffer with a simple gradient (raster-order intensity).
  const seed = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) seed[y * W + x] = ((x + y) & 127);
  graph.seedFront(seed);

  // --- Render frames ---
  const FRAMES = 30;
  for (let i = 0; i < FRAMES; i++) graph.step(zeroStep());

  // (1) Non-blank output (palette + warp always produces visible output)
  const rgba1 = graph.presentFrontRgba();
  const nonZero = (data: Uint8Array): number => {
    let n = 0;
    for (let i = 0; i < data.length; i += 4) if (data[i] || data[i + 1] || data[i + 2]) n++;
    return n;
  };
  expect(nonZero(rgba1), "non-blank output after 30 frames").toBeGreaterThan(W * H * 0.001);

  // (2) Animation: frame 5 vs frame 25
  for (let i = 0; i < 5; i++) graph.step(zeroStep());
  const early = graph.presentFrontRgba();
  for (let i = 0; i < 20; i++) graph.step(zeroStep());
  const late = graph.presentFrontRgba();

  let changed = false;
  for (let i = 0; i < early.length; i++) {
    if (Math.abs(early[i]! - late[i]!) > 4) { changed = true; break; }
  }
  expect(changed, "output evolved across frames").toBe(true);

  // (3) Coarse golden snapshot (tolerant; update with -u)
  expect(signature(late, 8, 6)).toMatchSnapshot("geiss-gpu-framegraph-8x6");

  graph.destroy();
  device.destroy();
});
