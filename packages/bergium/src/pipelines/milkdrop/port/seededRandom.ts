/**
 * SeededRandom — deterministic xorshift128+ PRNG.
 *
 * Mechanical TypeScript port of vendor/butterchurn/src/utils/seededRandom.js
 * (pinned revision fbac2f6). Behavior is verified against the vendored source in
 * tests/oracle/milkdrop-port-seeded-random.test.ts. The preset equation runner
 * uses this so MilkDrop preset randomness is reproducible across runs.
 */

export interface RNGContext {
  random: () => number;
  rand: (x: number) => number;
  randint: (x: number) => number;
  getRNG: () => SeededRandom | null;
  reset: (newSeed?: number) => void;
}

export class SeededRandom {
  public state: Uint32Array;

  public constructor(seed = 1) {
    this.state = new Uint32Array(4);
    SeededRandom.initializeState(this.state, seed);
    this.warmUp();
  }

  public static initializeState(state: Uint32Array, seed: number): void {
    state[0] = seed;
    state[1] = seed ^ 0x9e3779b9;
    state[2] = seed ^ 0x6a09e667;
    state[3] = seed ^ 0xbb67ae85;
  }

  public warmUp(): void {
    for (let i = 0; i < 10; i++) {
      this.next();
    }
  }

  /** Generate next random number in [0, 1). */
  public next(): number {
    // xorshift128+ algorithm — kept identical to the source (bit ops, Uint32 store).
    let t = this.state[3]!;
    const s = this.state[0]!;
    this.state[3] = this.state[2]!;
    this.state[2] = this.state[1]!;
    this.state[1] = s;

    t ^= t << 11;
    t ^= t >>> 8;
    this.state[0] = t ^ s ^ (s >>> 19);

    return (this.state[0]! >>> 0) / 0x100000000;
  }

  /** Generate random integer in [0, max). */
  public nextInt(max: number): number {
    return Math.floor(this.next() * max);
  }

  /** Generate random number in [0, max); mimics butterchurn's rand() behavior. */
  public rand(max: number): number {
    if (max < 1) {
      return this.next();
    }
    return Math.floor(this.next() * Math.floor(max));
  }

  /** Reset generator to the given seed. */
  public reset(seed: number): void {
    SeededRandom.initializeState(this.state, seed);
    this.warmUp();
  }
}

export function createRNGContext(seed = 1): RNGContext {
  const rng = new SeededRandom(seed);

  return {
    random: () => rng.next(),
    rand: (x) => rng.rand(x),
    randint: (x) => Math.floor(rng.rand(x) + 1),
    getRNG: () => rng,
    reset: (newSeed) => {
      if (newSeed !== undefined) {
        rng.reset(newSeed);
      } else {
        rng.reset(seed);
      }
    },
  };
}

export function createDefaultRNGContext(): RNGContext {
  return {
    random: Math.random,
    rand: (x) => (x < 1 ? Math.random() : Math.random() * Math.floor(x)),
    randint: (x) => Math.floor((x < 1 ? Math.random() : Math.random() * Math.floor(x)) + 1),
    getRNG: () => null,
    reset: () => {},
  };
}
