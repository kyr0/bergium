import { test, expect } from "vitest";
import Butterchurn from "butterchurn";
import { MilkdropPipeline } from "../../src/pipelines/milkdrop/MilkdropPipeline.js";
import type { RenderFrame } from "../../src/pipelines/types.js";
import type { RenderTarget } from "../../src/graphics/types.js";

const W = 320, H = 240;

/** A zeroed AudioFrame: the frozen renderer sources audio via connectAudio, so the
 * pipeline payload is unused here; it just satisfies the contract. */
const zeroFrame = (time: number): RenderFrame => ({
  presentationTimeSeconds: time,
  interpolation: 0,
  audio: {
    timestampSeconds: time, sampleRate: 44100,
    waveformLeft: new Float32Array(512), waveformRight: new Float32Array(512),
    spectrumLeft: new Float32Array(512), spectrumRight: new Float32Array(512),
    energy: 0, bass: 0, mid: 0, treble: 0,
    bassAttenuated: 0, midAttenuated: 0, trebleAttenuated: 0, beats: [],
  },
});
const stubTarget: RenderTarget = { descriptor: { label: "milkdrop", width: W, height: H, format: "rgba8" } };

/** Downsample a framebuffer to a coarse gw*gh average-RGB signature (golden). */
const signature = (data: Uint8ClampedArray, gw: number, gh: number): number[] => {
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
 * Why: Phase 1 "Freeze Butterchurn". Drives the pinned Butterchurn (published
 * prebuilt of the same version as the vendored revision) through the
 * MilkdropPipeline adapter, rendering its built-in default preset, and freezes:
 * (1) the exact Webamp API surface, (2) that it renders a non-blank, animating
 * image, and (3) a coarse golden snapshot (tolerant image metric per the plan -
 * MilkDrop is not byte-deterministic). Deterministic timing (mocked
 * performance.now) keeps the golden stable run-to-run. Live audio is Phase 3; the
 * preset animates on its own here, so no AudioContext resume is needed (which
 * would hang under headless autoplay policy).
 */
test("Phase 1 freeze: MilkdropPipeline drives pinned Butterchurn (API + non-blank + animation + golden)", async () => {
  let t = 0;
  const origNow = performance.now;
  performance.now = () => (t += 16.6667);

  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const ctx = new AudioContext();
  const viz = Butterchurn.createVisualizer(ctx, canvas, { width: W, height: H });
  const adapter = new MilkdropPipeline(viz);

  // (1) Freeze the Webamp-compatible API contract.
  expect(typeof viz.loadPreset, "loadPreset").toBe("function");
  expect(typeof viz.connectAudio, "connectAudio").toBe("function");
  expect(typeof viz.render, "render").toBe("function");
  expect(typeof viz.setRendererSize, "setRendererSize").toBe("function");
  expect(typeof viz.launchSongTitleAnim, "launchSongTitleAnim").toBe("function");

  const read = (): Uint8ClampedArray => canvas.getContext("2d")!.getImageData(0, 0, W, H).data;
  const nonZero = (d: Uint8ClampedArray): number => {
    let n = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i] || d[i + 1] || d[i + 2]) n++;
    return n;
  };

  // The built-in default preset animates on its own (warp + per-frame equations).
  for (let i = 0; i < 4; i++) adapter.render(zeroFrame(t), stubTarget);
  const early = read();
  for (let i = 0; i < 8; i++) adapter.render(zeroFrame(t), stubTarget);
  const late = read();

  // (2) Non-blank + animating.
  expect(nonZero(late), "non-blank output").toBeGreaterThan(W * H * 0.005);
  let changed = false;
  for (let i = 0; i < early.length; i++) {
    if (Math.abs(early[i]! - late[i]!) > 8) { changed = true; break; }
  }
  expect(changed, "output evolved across frames").toBe(true);

  // (3) Coarse golden snapshot (tolerant; pinned via vitest snapshot, update with -u).
  expect(signature(late, 8, 6)).toMatchSnapshot("butterchurn-freeze-8x6");

  await ctx.close();
  performance.now = origNow;
}, 30000);
