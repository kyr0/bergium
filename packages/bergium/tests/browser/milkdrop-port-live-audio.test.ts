import { test, expect } from "vitest";
import { createButterchurnVisualizer } from "../../src/pipelines/milkdrop/port/index.js";
import { MilkdropPipeline } from "../../src/pipelines/milkdrop/MilkdropPipeline.js";
import type { RenderFrame } from "../../src/pipelines/types.js";

const W = 320, H = 240;

/** A zeroed AudioFrame. */
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

/** Coarse average-RGB signature for snapshot comparison. */
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
 * Why: Phase 1 + 2 integration test. Verifies the in-tree butterchurn port
 * (all TypeScript-native modules) renders to canvas via MilkdropPipeline.
 *
 * Uses the blank preset (no external audio dependency) to exercise the full render
 * pipeline: AudioProcessor => Renderer => Warp => Comp => Output => Canvas.
 *
 * Renders 30 frames and:
 * (1) asserts non-blank output,
 * (2) asserts the output evolves over time (even with zero audio, the time-based
 *     equations produce animation),
 * (3) captures a coarse golden snapshot for regression tracking.
 */
test("In-tree butterchurn port: renders blank preset, non-blank + animating, golden snapshot",
  async () => {
    // --- Canvas + AudioContext (no audio fed - uses time-based equations only) ---
    const canvas = document.createElement("canvas");
    canvas.width = W; canvas.height = H;
    const ctx = new AudioContext();

    // --- In-tree butterchurn (direct factory - no pipeline routing needed) ---
    const viz = createButterchurnVisualizer(ctx, canvas, { width: W, height: H });
    const adapter = new MilkdropPipeline(viz);

    // (1) Webamp-compatible API surface
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

    // --- Render frames (null target = legacy canvas path; time advances even with zero audio) ---
    const FRAMES = 30;
    for (let i = 0; i < FRAMES; i++) {
      adapter.render(zeroFrame(i * (1 / 30)), null);
    }

    // (2) Non-blank output (blank preset still produces warp/comp shader output)
    const data = read();
    expect(nonZero(data), "non-blank output after 30 frames").toBeGreaterThan(W * H * 0.001);

    // (3) Animation: time-based equations produce visible evolution even without audio
    for (let i = 0; i < 5; i++) adapter.render(zeroFrame(5 / 30), null);
    const early = read();
    for (let i = 0; i < 20; i++) adapter.render(zeroFrame(25 / 30), null);
    const late = read();

    let changed = false;
    for (let i = 0; i < early.length; i++) {
      if (Math.abs(early[i]! - late[i]!) > 8) { changed = true; break; }
    }
    expect(changed, "output evolved across frames").toBe(true);

    // (4) Coarse golden snapshot (tolerant; update with -u)
    expect(signature(late, 8, 6)).toMatchSnapshot("milkdrop-port-live-audio-8x6");

    await ctx.close();
  }, 30000);
