import { injectMax, type IntensityFrame } from "./FeedbackWarp.js";

/** Inputs that determine the waveform trace, independent of the feedback buffer. */
export interface WaveformGeometry {
  width: number;
  height: number;
  hideCut: number;
  centerX: number;
  centerY: number;
  mode: number;
  waveform: 1 | 2 | 3 | 4 | 5 | 6;
  frameNumber: number;
  samples: Float32Array;
}

export interface WaveRenderInput extends WaveformGeometry {
  frame: IntensityFrame;
  cut: number;
  brightness: number;
}

const plot = (i: WaveRenderInput, x: number, y: number): void => {
  x = Math.trunc(x);
  y = Math.trunc(y);
  if (x >= 0 && x < i.width && y >= i.hideCut && y < i.height - i.hideCut)
    injectMax(i.frame, y * i.width + x, i.brightness);
};

/**
 * The waveform trace as ordered float points — the shared geometry oracle used by
 * both the CPU renderer and the GPU max-blend pass. Emission order and the cursor
 * recurrence (`.9/.1`, `.5/.5`) are identical to the original inline loops, so
 * `renderWave` (which plots these) is unchanged. Waveform 7 is unreachable in the
 * source and intentionally absent.
 */
export function waveformCurve(g: WaveformGeometry): Array<[number, number]> {
  const s = upsample(g.samples, g.width, g.waveform);
  const { width: W, height: H, hideCut, centerX, centerY, mode, waveform, frameNumber } = g;
  const out: Array<[number, number]> = [];
  let zL = 0, zR = 0;

  if (waveform === 1) {
    const start = mode === 10 ? (W >= 640 ? 15 : 10) : 0;
    const end = mode === 10 ? W - (W >= 640 ? 15 : 10) : W;
    zL = s[start & ~1]! + centerY;
    for (let x = start; x < end; x++) { zL = .9 * zL + .1 * (s[x & ~1]! + centerY); out.push([x, zL]); }
    return out;
  }
  if (waveform === 2) {
    const y1 = centerY - H * .12, y2 = centerY + H * .12;
    zL = s[0]! * .7 + y1;
    zR = s[1]! * .7 + y2;
    for (let x = 0; x < W; x++) {
      zL = .9 * zL + .1 * (s[x & ~1]! * .7 + y1);
      zR = .9 * zR + .1 * (s[(x & ~1) + 1]! * .7 + y2);
      out.push([x, zL], [x, zR]);
    }
    return out;
  }
  if (waveform === 3) {
    zL = s[hideCut & ~1]! + centerX;
    for (let y = hideCut; y < H - hideCut; y++) { zL = .9 * zL + .1 * (s[y & ~1]! + centerX); out.push([zL, y]); }
    return out;
  }
  if (waveform === 4) {
    zL = s[hideCut & ~1]! * .9;
    zR = s[(hideCut & ~1) + 1]! * .9;
    for (let y = hideCut; y < H - hideCut; y++) {
      zL = .9 * zL + .1 * s[y & ~1]! * .9;
      zR = .9 * zR + .1 * s[(y & ~1) + 1]! * .9;
      out.push([zL + y, y], [zR + y + W - H, y]);
    }
    return out;
  }
  if (waveform === 5) {
    for (let n = 0; n < 50; n++) { const a = n / 50, even = n & ~1; s[even] = s[even]! * a + (1 - a) * s[(n + 314) & ~1]!; }
    const base = W === 320 ? 40 : W / 640 * 60;
    let radius = base + s[0]! * .7;
    for (let n = 0; n < 314; n++) {
      radius = .5 * radius + .5 * (base + s[n & ~1]! * .7);
      if (radius >= 5) out.push([centerX + radius * Math.cos(n * .02), centerY + radius * Math.sin(n * .02)]);
    }
    return out;
  }
  // waveform === 6: rotated stereo XY
  const angle = Math.sin(frameNumber * .01), co = Math.cos(angle), si = Math.sin(angle);
  let x2 = s[0]!, y2 = s[1]!;
  for (let n = 0; n < 314; n++) {
    x2 = .5 * x2 + .5 * s[n * 2]! * 1.2;
    y2 = .5 * y2 + .5 * s[n * 2 + 1]! * 1.2;
    out.push([centerX + x2 * co + y2 * si, centerY - x2 * si + y2 * co]);
  }
  return out;
}

/** Six reachable classic waveforms. CPU-readable oracle; plots the shared curve. */
export function renderWave(i: WaveRenderInput): void {
  for (const [x, y] of waveformCurve(i)) plot(i, x, y);
}

function upsample(source: Float32Array, width: number, wave: 1 | 2 | 3 | 4 | 5 | 6): Float32Array {
  const passes = (wave === 1 || wave === 2) ? (width >= 1920 ? 2 : width > 1024 ? 1 : 0) : (width >= 1440 ? 1 : 0);
  let s = source.slice();
  let remaining = passes;
  while (remaining-- > 0) {
    const out = new Float32Array(Math.min(16384, s.length * 2));
    let l = s[0]!, r = s[1]!;
    for (let n = 0; n < Math.min(width * 2, s.length - 2); n += 2) {
      const nl = s[n + 2]! * 1.14, nr = s[n + 3]! * 1.14, o = n * 2;
      out[o] = l; out[o + 1] = r; out[o + 2] = (l + nl) * .5; out[o + 3] = (r + nr) * .5;
      l = nl; r = nr;
    }
    s = out;
  }
  return s;
}
