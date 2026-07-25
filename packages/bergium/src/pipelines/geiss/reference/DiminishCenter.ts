import type { IntensityFrame } from "./FeedbackWarp.js";

export interface DiminishOpts {
  centerX: number;
  centerY: number;
  width: number;
  height: number;
  /** Active vertical cut (FX_YCUT); plugin default is 4. */
  cut: number;
  /** Per-mode center decay factor from the mode table. */
  centerDwindle: number;
  mode: number;
}

/**
 * Source-derived 8-bit Diminish_Center (vendor/geiss/Effects.h:257). It is a
 * localized multiplicative decay of the feedback buffer applied as the LAST step
 * of the effect pass, just before the warp. Two shapes: a 5-pixel center cross
 * (modes != 12) with a `>1` guard, or a 3-pixel-wide vertical line (mode 12) with
 * NO guard. No-op when `centerDwindle >= 0.999`. The `(uchar)` cast truncates
 * toward zero, so we use Math.trunc. Bounds checks are defensive: the live center
 * is always in range, so they never change the result vs the source.
 */
export function diminishCenter(frame: IntensityFrame, o: DiminishOpts): void {
  if (o.centerDwindle >= 0.999) return;
  const { width: W, height: H, centerX: cx, centerY: cy, cut, centerDwindle: d, mode } = o;
  const decay = (idx: number): void => {
    frame[idx] = Math.trunc(frame[idx]! * d);
  };

  if (mode !== 12) {
    const cross: ReadonlyArray<readonly [number, number]> = [
      [cx, cy], [cx - 1, cy], [cx + 1, cy], [cx, cy + 1], [cx, cy - 1],
    ];
    for (const [x, y] of cross) {
      const idx = y * W + x;
      if (idx >= 0 && idx < frame.length && frame[idx]! > 1) decay(idx);
    }
  } else {
    for (let y = cut; y < H - cut; y++) {
      const base = y * W + cx;
      for (const dx of [-1, 0, 1] as const) {
        const idx = base + dx;
        if (idx >= 0 && idx < frame.length) decay(idx); // vertical-line branch: no >1 guard
      }
    }
  }
}
