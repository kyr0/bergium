import { MsvcRandom } from "../../src/pipelines/geiss/reference/MsvcRandom.js";
import type { RandomSource } from "../../src/pipelines/geiss/reference/MapField.js";

/** Seeded factory so every fixture starts from a pinned, reproducible PRNG stream. */
export const makeRng = (seed: number): MsvcRandom => new MsvcRandom(seed);

/**
 * Deterministic scripted RNG for asserting exact PRNG-dependent branches
 * (e.g. forcing createPalette into its fx/non-fx path). Each call to nextRaw
 * returns the next scripted value, cycling so a test never reads "undefined".
 */
export class ScriptedRandom implements RandomSource {
  private readonly values: readonly number[];
  private pos = 0;
  public constructor(...values: number[]) {
    this.values = values;
  }
  public nextRaw(): number {
    return this.values[this.pos++ % this.values.length] ?? 0;
  }
  public nextInt(maxExclusive: number): number {
    return this.nextRaw() % maxExclusive;
  }
  public nextFloat(): number {
    return this.nextRaw() / 32768;
  }
}
