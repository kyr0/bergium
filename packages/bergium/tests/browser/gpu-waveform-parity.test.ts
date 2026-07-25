import { test, expect } from "vitest";
import { WebGLGraphicsDevice, WebGLRenderTarget } from "../../src/graphics/WebGLGraphicsDevice.js";
import { GeissWaveform } from "../../src/pipelines/geiss/gpu/GeissWaveform.js";
import { renderWave } from "../../src/pipelines/geiss/reference/WaveformRenderer.js";

/** Deterministic audio-like waveform samples (small amplitude, stays near center). */
const buildSamples = (n: number): Float32Array => {
  const s = new Float32Array(n);
  for (let i = 0; i < n; i++) s[i] = Math.sin(i * 0.07) * 28 + Math.sin(i * 0.31) * 9;
  return s;
};

/** Seed an intensity buffer with a varied background so max-blend is exercised. */
const background = (i: number): number => (i % 7) * 40; // 0,40,80,120,160,200,240

/**
 * Why: each of the six classic waveforms must max-blend into the intensity target
 * identically to the CPU `renderWave` oracle. The same geometry + background is
 * rendered on CPU (renderWave) and GPU (GeissWaveform) and compared byte-for-byte.
 */
test("GPU waveform max-blend matches renderWave for all six waveforms (640x480)", () => {
  const W = 640, H = 480;
  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const device = new WebGLGraphicsDevice(canvas);
  const wave = new GeissWaveform(device, W, H);
  const samples = buildSamples(1024);

  for (const waveform of [1, 2, 3, 4, 5, 6] as const) {
    const geom = { width: W, height: H, hideCut: 0, centerX: 320, centerY: 240, mode: 1, frameNumber: 7, samples, waveform };

    // CPU: renderWave into a background-seeded frame.
    const cpu = new Uint8Array(W * H);
    for (let i = 0; i < cpu.length; i++) cpu[i] = background(i);
    renderWave({ ...geom, frame: cpu, cut: 4, brightness: 200 });

    // GPU: same background into a target, then GeissWaveform max-blend.
    const target = device.createRenderTarget({ label: "wave", width: W, height: H, format: "rgba8" });
    const packed = new Uint8Array(W * H * 4);
    for (let i = 0; i < W * H; i++) { packed[i * 4] = background(i); packed[i * 4 + 3] = 255; }
    device.uploadColorTexture((target as WebGLRenderTarget).texture, W, H, packed);
    wave.render(target, { ...geom, brightness: 200 });
    const gpu = device.readRedChannel(target);
    device.destroyRenderTarget(target);

    expect(Array.from(gpu), `waveform ${waveform}`).toEqual(Array.from(cpu));
    // sanity: the waveform actually changed at least one pixel from its background.
    let drew = false;
    for (let i = 0; i < gpu.length; i++) if (gpu[i] !== background(i)) { drew = true; break; }
    expect(drew, `waveform ${waveform} drew nothing`).toBe(true);
  }

  wave.destroy();
  device.destroy();
});
