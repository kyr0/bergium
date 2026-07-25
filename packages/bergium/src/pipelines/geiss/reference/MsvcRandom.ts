import type { RandomSource } from "./MapField.js";

/**
 * Declared exact-profile PRNG: the Visual C runtime `rand()` LCG
 * (state = state*214013 + 2531011; raw = (state >>> 16) & 0x7fff). The output is
 * pinned to the canonical MSVC sequence by `tests/oracle/msvc-random.test.ts`; the
 * pinned Geiss C source is a read-only reference, never built or instrumented.
 */
export class MsvcRandom implements RandomSource {
  private state: number;
  public constructor(seed: number) { this.state = seed >>> 0; }
  public nextRaw(): number { this.state = (Math.imul(this.state, 214013) + 2531011) >>> 0; return (this.state >>> 16) & 0x7fff; }
  public nextInt(maxExclusive: number): number { return this.nextRaw() % maxExclusive; }
  public nextFloat(): number { return this.nextRaw() / 32768; }
  public snapshot(): number { return this.state; }
}
