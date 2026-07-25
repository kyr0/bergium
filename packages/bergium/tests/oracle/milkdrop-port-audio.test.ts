import { test } from "vitest";
import assert from "node:assert/strict";
import FFT from "../../src/pipelines/milkdrop/port/fft.js";
import AudioProcessor from "../../src/pipelines/milkdrop/port/audioProcessor.js";
import AudioLevels from "../../src/pipelines/milkdrop/port/audioLevels.js";
import { getRNG } from "../../src/pipelines/milkdrop/port/rngContext.js";

/** Round the first n elements of an array-like to 6 decimals for golden compare. */
const r6 = (arr: ArrayLike<number>, n: number): number[] => {
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(+(arr[i] as number).toFixed(6));
  return out;
};

// Goldens captured from the vendored pinned source (fft/audioProcessor/audioLevels).
const FFT_FIRST8 = [0, 0.037909, 0.087454, 0.159002, 0.2761, 0.47656, 0.880723, 2.013355];
const AP_L_FIRST4 = [0, 0.037909, 0.087454, 0.159002];
const AP_R_FIRST4 = [0, 0.077706, 0.163636, 0.270675];

const sineInput = (i: number): number => Math.round(120 * Math.sin(i * 0.05));
const cosInput = (i: number): number => 128 + Math.round(120 * Math.cos(i * 0.05));

test("ported FFT matches vendored equalized spectrum (sine input)", () => {
  const fft = new FFT(1024, 512, true);
  const input = new Int8Array(1024);
  for (let i = 0; i < 1024; i++) input[i] = sineInput(i);
  const freq = fft.timeToFrequencyDomain(input);
  assert.equal(freq.length, 512);
  assert.deepEqual(r6(freq, 8), FFT_FIRST8);
});

test("ported AudioProcessor.updateAudio matches vendored freq arrays (the AudioWorklet seam)", () => {
  const ap = new AudioProcessor(); // no AudioContext — pure path used by ringbuf feed
  const tb = new Uint8Array(1024), tbL = new Uint8Array(1024), tbR = new Uint8Array(1024);
  for (let i = 0; i < 1024; i++) {
    const v = 128 + sineInput(i);
    tb[i] = v; tbL[i] = v; tbR[i] = cosInput(i);
  }
  ap.updateAudio(tb, tbL, tbR);
  assert.deepEqual(r6(ap.freqArray!, 8), FFT_FIRST8);
  assert.deepEqual(r6(ap.freqArrayL!, 4), AP_L_FIRST4);
  assert.deepEqual(r6(ap.freqArrayR!, 4), AP_R_FIRST4);
});

test("ported AudioLevels matches vendored bass/mid/treble + attack", () => {
  const ap = new AudioProcessor();
  const tb = new Uint8Array(1024), tbL = new Uint8Array(1024), tbR = new Uint8Array(1024);
  for (let i = 0; i < 1024; i++) {
    const v = 128 + sineInput(i);
    tb[i] = v; tbL[i] = v; tbR[i] = cosInput(i);
  }
  ap.updateAudio(tb, tbL, tbR);

  const al = new AudioLevels({ freqArray: ap.freqArray!, fftSize: 1024, numSamps: 512, audioContext: null });
  al.updateAudioLevels(30, 0);
  assert.deepEqual(
    [+al.bass.toFixed(6), +al.mid.toFixed(6), +al.treb.toFixed(6), +al.bass_att.toFixed(6)],
    [1.033201, 8.811079, 9.440544, 1.025823],
  );
  al.updateAudioLevels(30, 60);
  assert.deepEqual(
    [+al.bass.toFixed(6), +al.mid.toFixed(6), +al.treb.toFixed(6)],
    [1.032926, 8.292869, 8.843399],
  );
});

test("ported rngContext.getRNG returns a usable RNG context", () => {
  const ctx = getRNG();
  assert.equal(typeof ctx.random, "function");
  assert.equal(typeof ctx.rand, "function");
  assert.equal(typeof ctx.randint, "function");
});
