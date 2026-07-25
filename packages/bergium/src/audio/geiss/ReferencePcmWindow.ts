/** Geiss compatibility audio is defined in the 44.1 kHz Winamp sample domain. */
export class ReferencePcmWindow {
  private readonly left: number[] = [];
  private readonly right: number[] = [];
  private phase = 0;

  public constructor(private readonly inputRate: number, private readonly referenceRate = 44_100) { }

  /** Linear streaming resampling is deterministic; replace only with fixture approval. */
  public pushInterleaved(input: Float32Array, channels: 1 | 2): void {
    const frames = Math.trunc(input.length / channels), step = this.inputRate / this.referenceRate;
    while (this.phase < frames - 1) {
      const i = Math.trunc(this.phase), f = this.phase - i;
      const l = input[i * channels]! * (1 - f) + input[(i + 1) * channels]! * f;
      const r = channels === 2 ? input[i * 2 + 1]! * (1 - f) + input[(i + 1) * 2 + 1]! * f : l;
      this.left.push(l); this.right.push(r); this.phase += step;
    }
    this.phase -= frames;
    if (this.left.length > 4096) { this.left.splice(0, this.left.length - 4096); this.right.splice(0, this.right.length - 4096); }
  }

  /** Web Audio's byte conversion is host-defined; this explicitly chooses truncation. */
  public latestSignedBytes(count = 576): { left: Int8Array; right: Int8Array } {
    const l = new Int8Array(count), r = new Int8Array(count), start = Math.max(0, this.left.length - count);
    for (let i = 0; i < count; i++) {
      l[i] = Math.max(-128, Math.min(127, Math.trunc((this.left[start + i] ?? 0) * 128)));
      r[i] = Math.max(-128, Math.min(127, Math.trunc((this.right[start + i] ?? 0) * 128)));
    }
    return { left: l, right: r };
  }
}

