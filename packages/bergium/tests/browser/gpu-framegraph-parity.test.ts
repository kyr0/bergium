import { test, expect } from "vitest";
import { WebGLGraphicsDevice } from "../../src/graphics/WebGLGraphicsDevice.js";
import { GeissGpuFrameGraph } from "../../src/pipelines/geiss/gpu/GeissGpuFrameGraph.js";
import { warpIntensity8, injectAdd } from "../../src/pipelines/geiss/reference/FeedbackWarp.js";
import { renderWave } from "../../src/pipelines/geiss/reference/WaveformRenderer.js";
import { diminishCenter } from "../../src/pipelines/geiss/reference/DiminishCenter.js";
import { quantizeMapTexel } from "../../src/pipelines/geiss/reference/MapField.js";
import { createMapParameters } from "../../src/pipelines/geiss/reference/MapParameterFactory.js";
import { createPalette } from "../../src/pipelines/geiss/reference/Palette.js";
import { MsvcRandom } from "../../src/pipelines/geiss/reference/MsvcRandom.js";

const NOISE = (): Float32Array => new Float32Array(2345);
const clampByte = (v: number): number => Math.max(0, Math.min(255, Math.round(v)));

/**
 * Why: end-to-end proof that the assembled GPU frame graph (ping-pong loop) stays
 * byte-faithful to the CPU oracle across animation. Each frame runs the normative
 * order on CPU (oracle primitives) and GPU (the graph), then compares BOTH the
 * front intensity and the palette-presented RGBA output.
 */
test("GPU frame-graph ping-pong loop matches the CPU oracle every frame (intensity + palette)", () => {
  const W = 64, H = 48, seed = 1;
  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const device = new WebGLGraphicsDevice(canvas);
  const graph = new GeissGpuFrameGraph(device, W, H);

  // One map activation + palette.
  const params = createMapParameters(2, W, H, 4, 30, 1, NOISE(), new MsvcRandom(seed));
  const rng = new MsvcRandom(seed * 97 + 1);
  const map = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) map.push(quantizeMapTexel(x, y, params, rng));
  graph.setMap(map);
  const { colors } = createPalette(new MsvcRandom(7), 10, false, 1, 1);
  graph.setPalette(colors);

  // Fixed per-frame inputs (the front still animates via the warp each frame).
  const preWarp = new Uint8Array(W * H);
  const postWarp = new Uint8Array(W * H);
  for (let i = 0; i < preWarp.length; i++) preWarp[i] = (i % 5) * 10;
  for (let i = 0; i < postWarp.length; i++) postWarp[i] = (i % 7) * 5;
  const samples = new Float32Array(1024);
  for (let i = 0; i < samples.length; i++) samples[i] = Math.sin(i * 0.07) * 28 + Math.sin(i * 0.31) * 9;
  const diminishOpts = { centerX: 32, centerY: 24, width: W, height: H, cut: 4, centerDwindle: 0.99, mode: 3 };
  const waveGeom = { width: W, height: H, hideCut: 0, centerX: 32, centerY: 24, mode: 1, frameNumber: 0, samples, waveform: 1 as const, brightness: 200 };
  const input = { preWarp, postWarp, waveform: waveGeom, diminish: diminishOpts };

  const init0 = new Uint8Array(W * H);
  for (let i = 0; i < init0.length; i++) init0[i] = (i * 37) & 255;
  graph.seedFront(init0);

  let cpuFront = Uint8Array.from(init0);
  let cpuBack = new Uint8Array(W * H);

  for (let f = 0; f < 5; f++) {
    // CPU step — same normative order as the GPU graph.
    for (let i = 0; i < cpuFront.length; i++) injectAdd(cpuFront, i, preWarp[i]!);
    diminishCenter(cpuFront, diminishOpts);
    warpIntensity8(cpuFront, cpuBack, map, W);
    for (let i = 0; i < cpuBack.length; i++) injectAdd(cpuBack, i, postWarp[i]!);
    renderWave({ width: W, height: H, hideCut: 0, centerX: 32, centerY: 24, mode: 1, frameNumber: 0, samples, frame: cpuBack, cut: 4, brightness: 200, waveform: 1 });
    const t = cpuFront; cpuFront = cpuBack; cpuBack = t;

    graph.step(input);

    expect(Array.from(graph.readFrontRed()), `frame ${f} intensity`).toEqual(Array.from(cpuFront));

    const expected: number[] = [];
    for (let i = 0; i < cpuFront.length; i++) {
      const c = colors[cpuFront[i]!]!;
      expected.push(clampByte(c.r), clampByte(c.g), clampByte(c.b), 255);
    }
    expect(Array.from(graph.presentFrontRgba()), `frame ${f} palette`).toEqual(expected);
  }

  graph.destroy();
  device.destroy();
});
