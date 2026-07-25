export interface GeissAudioOptions {
  width: number; fpsAtModeSwitch: number; displayBits: 8 | 32; visMode: "waveform" | "spectrum";
  waveform: 1 | 2 | 3 | 4 | 5 | 6; useBeatDetection: boolean; slideShift: boolean;
}
export interface GeissAudioState {
  sound: Float32Array; power: Float32Array; powerSmoothed: Float32Array;
  currentVolume: number; averageVolume: number; narrowVolume: number; wideVolume: number;
  averagePeaks: number; beatStrength: number; beatMode: boolean; bigBeat: boolean;
  brightnessScale: number; baseBrightness: number; slider1: number;
}
const N = 120, FOURIER = 24;
const adjust = (rate: number, baseFps: number, fps: number) => rate ** (baseFps / fps);

/** Source-derived frame analyzer. Mutable state/order are intentional. */
export class GeissAudioAnalyzer {
  private readonly sound = new Float32Array(16384);
  private readonly raw = new Int32Array(16384);
  private readonly power = new Float32Array(FOURIER);
  private readonly smoothed = new Float32Array(FOURIER);
  private readonly history = new Float32Array(N);
  private historyPos = 0;
  private current = 0; private avg = 1; private narrow = 1; private wide = 1; private avgPeaks = 100;
  private beatMode = false; private slider = 0; private shiftMax = 0; private framesSinceShift = 0;
  private lastFrameValue = 0; private lastFrameSlope = 0;

  /** Input is Winamp-compatible signed bytes for one reference window. */
  public analyze(left: Int8Array, right: Int8Array, o: GeissAudioOptions, randomInt: (n: number) => number): GeissAudioState {
    this.getWaveData(left, right, o);
    this.updateVolume(o);
    const derived = this.updateBeatAndBrightness(o, randomInt);
    return {
      sound: this.sound, power: this.power, powerSmoothed: this.smoothed, currentVolume: this.current,
      averageVolume: this.avg, narrowVolume: this.narrow, wideVolume: this.wide, averagePeaks: this.avgPeaks, ...derived
    };
  }

  private getWaveData(left: Int8Array, right: Int8Array, o: GeissAudioOptions): void {
    const quarter = Math.trunc(o.width / 4), start = 5 + quarter, stop = 511 - 365 + quarter;
    let y = start, found = false;
    for (; y < stop; y++) {
      const v = left[y] ?? 0, old = left[y - 5] ?? 0;
      if (Math.abs(v - this.lastFrameValue) <= 1 && this.lastFrameSlope * (v - old) >= 0) {
        this.lastFrameSlope = v - old; this.lastFrameValue = v; found = true; break;
      }
    }
    if (!found) { y = start; const old = left[y - 5] ?? 0, v = left[y] ?? 0; this.lastFrameSlope = v - old; this.lastFrameValue = v; }
    y -= quarter;

    const bufferSize = Math.min(1023, Math.max(o.width * 2, (314 + 50) * 2 + 20));
    for (let x = 0; x < bufferSize && y < 512; x += 2, y++) {
      this.raw[x] = (left[y] ?? 0) << 8; this.raw[x + 1] = (right[y] ?? 0) << 8;
    }
    const div = 1 / (64 * (640 / o.width)), scale = .20 * div;
    // The plugin source then smooths sample i from i and i+2.
    for (let i = 0; i < bufferSize - 2; i++)this.sound[i] = (.8 * this.raw[i]! + .2 * this.raw[i + 2]!) * scale;
    for (let i = bufferSize - 2; i < bufferSize; i++)this.sound[i] = this.raw[i]! * scale;

    // Sparse mean (every eighth interleaved value), divided by W*.125.
    let meanL = 0, meanR = 0;
    for (let i = 0; i < bufferSize; i += 8) { meanL += this.sound[i]!; meanR += this.sound[i + 1]!; }
    meanL /= o.width * .125; meanR /= o.width * .125;
    // Explicit read guards satisfy noUncheckedIndexedAccess while preserving the
    // source's in-place DC subtraction (values are guaranteed in range above).
    for (let i = 0; i < bufferSize; i += 2) { this.sound[i] = (this.sound[i] ?? 0) - meanL; this.sound[i + 1] = (this.sound[i + 1] ?? 0) - meanR; }

    if (o.displayBits > 8) {
      for (let n = 1; n < FOURIER; n++) {
        const w = 6.28 * (20 * 2 ** (n / FOURIER * 10) / 44100); let a = 0, b = 0;
        for (let i = 0; i < 256; i++) { const s = this.sound[i * 2] ?? 0; a += s * Math.cos(i * w); b += s * Math.sin(i * w); }
        this.power[n] = Math.hypot(a, b); this.smoothed[n] = .94 * this.smoothed[n]! + .06 * this.power[n]!;
      }
      // Original calculates suggested damping from band change and then forces 1.0.
    }
  }

  /** Equivalent to RenderDots' analysis prefix; drawing nuclide blobs is a renderer concern. */
  private updateVolume(o: GeissAudioOptions): void {
    const bufferSize = Math.min(1023, Math.max(o.width * 2, (314 + 50) * 2 + 20));
    let low = this.sound[0]!, high = this.sound[0]!, peaks = 0;
    for (let i = bufferSize - 4; i > 0; i -= 4) { const v = this.sound[i]!; low = Math.min(low, v); high = Math.max(high, v); }
    const vol = (high - low) / 256;
    this.historyPos = (this.historyPos + 1) % N; this.history[this.historyPos] = this.current; this.current = vol;
    const fps = o.fpsAtModeSwitch;
    this.narrow = this.narrow * adjust(.30, 30, fps) + vol * (1 - adjust(.30, 30, fps));
    this.avg = this.avg * adjust(.85, 30, fps) + vol * (1 - adjust(.85, 30, fps));
    this.wide = this.wide * adjust(.96, 30, fps) + vol * (1 - adjust(.96, 30, fps));
    this.avgPeaks = this.avgPeaks * adjust(.90, 30, fps) + peaks * (1 - adjust(.90, 30, fps));
  }

  private updateBeatAndBrightness(o: GeissAudioOptions, randomInt: (n: number) => number): Pick<GeissAudioState, "beatStrength" | "beatMode" | "bigBeat" | "brightnessScale" | "baseBrightness" | "slider1"> {
    this.history[this.historyPos] = this.narrow;
    let mean = 0; for (const v of this.history) mean += v; mean /= N;
    let strength = 0; for (let i = 1; i < N; i++)strength += Math.max(0, Math.abs(this.history[i]! - this.history[i - 1]!) - mean * .15);
    strength = mean < 10 ? 0 : strength / mean * 10;
    if (strength > 109) this.beatMode = true; if (strength < 71) this.beatMode = false;
    let variance = 0; for (const v of this.history) variance += (v - mean) ** 2; variance /= N - 1;
    const std = Math.sqrt(variance);
    let maxVol = 0; for (let i = 0; i < N / 3; i++)maxVol = Math.max(maxVol, this.history[i]!); // physical slots: source quirk
    const bigBeat = this.narrow > maxVol * 1.10;
    const brightness = Math.max(0, Math.min(1, (this.current - mean) / (std * .5)));
    let base = Math.trunc(this.current * 4 + this.avg * .4 - 10);
    if (this.beatMode && o.useBeatDetection && o.visMode !== "spectrum" && o.waveform !== 6) base = Math.trunc(base * brightness);
    base = Math.max(0, Math.min(155, base));
    if (this.beatMode && o.slideShift) {
      if (this.current > this.shiftMax) { this.shiftMax = this.current * 1.05; if (this.framesSinceShift > 2) { this.framesSinceShift = 0; let s = Math.trunc((randomInt(Math.trunc(o.width / 2)) + 50) / 145); if (this.slider > 0) s *= -1; this.slider = s + (randomInt(3) - 1) * o.width; } }
      else { const rate = adjust(.975, 30, o.fpsAtModeSwitch), limit = mean * 1.43; this.shiftMax = this.shiftMax * rate + limit * (1 - rate); this.framesSinceShift++; }
    }
    return { beatStrength: strength, beatMode: this.beatMode, bigBeat, brightnessScale: brightness, baseBrightness: base, slider1: this.slider };
  }
}
