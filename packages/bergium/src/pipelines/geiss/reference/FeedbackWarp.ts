import type { MapTexel } from "./MapField.js";

export type IntensityFrame = Uint8Array;

/** Portable exact 8-bit path: four integer products and truncation by >> 8. */
export function warpIntensity8(source: IntensityFrame, destination: IntensityFrame, map: readonly MapTexel[], width: number): void {
  for (let i = 0; i < map.length; i++) {
    const m = map[i]!, o = m.sourceY * width + m.sourceX;
    destination[i] = (source[o]! * m.w00 + source[o + 1]! * m.w10 + source[o + width]! * m.w01 + source[o + width + 1]! * m.w11) >>> 8;
  }
}

/** Max injection is the classic waveform write rule. */
export function injectMax(frame: IntensityFrame, index: number, value: number): void {
  if (index >= 0 && index < frame.length && value > frame[index]!) frame[index] = Math.min(255, Math.trunc(value));
}

/** Additive/saturating injection is used by nuclide blobs and several effects. */
export function injectAdd(frame: IntensityFrame, index: number, value: number): void {
  if (index >= 0 && index < frame.length) frame[index] = Math.min(255, frame[index]! + Math.trunc(value));
}

