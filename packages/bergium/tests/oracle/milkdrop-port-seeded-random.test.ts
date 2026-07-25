import { test } from "vitest";
import assert from "node:assert/strict";
import { SeededRandom, createRNGContext } from "../../src/pipelines/milkdrop/port/seededRandom.js";
import Utils from "../../src/pipelines/milkdrop/port/Utils.js";

// Golden values captured from the vendored pinned source
// (vendor/butterchurn/src/utils/seededRandom.js). The TS port must reproduce them
// exactly — this is the "mechanical port" regression guard for Phase 1/8.
const SEED1_NEXT10 = [
  0.6057086302898824, 0.4083256188314408, 0.25416341074742377, 0.8699094406329095,
  0.22117962269112468, 0.06261173472739756, 0.8399010733701289, 0.605112976860255,
  0.3570057915057987, 0.4447894785553217,
];
const SEED42_NEXT5 = [0.6055323528125882, 0.4082459199707955, 0.9505717826541513, 0.1891532044392079, 0.5411764218006283];
const SEED7_RANDSEQ = [60, 40, 0, 0.7001878684386611, 17, 24];
const CTX_RANDOM_3 = [0.6057580579072237, 0.40854799654334784, 0.9015197032131255];
const CTX_RANDINT100 = 58;
const CTX_AFTER_RESET = [0.6057580579072237, 0.40854799654334784];

test("ported SeededRandom reproduces the vendored xorshift128+ sequence (seed 1)", () => {
  const r = new SeededRandom(1);
  assert.deepEqual(Array.from({ length: 10 }, () => r.next()), SEED1_NEXT10);
});

test("ported SeededRandom reproduces the vendored sequence (seed 42)", () => {
  const r = new SeededRandom(42);
  assert.deepEqual(Array.from({ length: 5 }, () => r.next()), SEED42_NEXT5);
});

test("ported rand/nextInt/edge cases match the vendored source (seed 7)", () => {
  const r = new SeededRandom(7);
  assert.deepEqual(
    [r.rand(100), r.rand(100), r.rand(1), r.rand(0.5), r.nextInt(50), r.nextInt(50)],
    SEED7_RANDSEQ,
  );
});

test("ported createRNGContext is deterministic and resettable (matches vendored)", () => {
  const ctx = createRNGContext(123);
  assert.deepEqual([ctx.random(), ctx.random(), ctx.random()], CTX_RANDOM_3);
  assert.equal(ctx.randint(100), CTX_RANDINT100);
  ctx.reset(123);
  assert.deepEqual([ctx.random(), ctx.random()], CTX_AFTER_RESET);
});

test("ported Utils helpers match the vendored semantics", () => {
  // atan2 normalizes to [0, 2π).
  assert.equal(Utils.atan2(1, 0), Math.PI / 2);
  assert.ok(Utils.atan2(-1, 0) > Math.PI);
  // range overloads.
  assert.deepEqual(Utils.range(3), [0, 1, 2]);
  assert.deepEqual(Utils.range(2, 5), [2, 3, 4]);
  // pick defaults missing keys to 0; omit removes keys.
  assert.deepEqual(Utils.pick({ a: 7 }, ["a", "b"]), { a: 7, b: 0 });
  assert.deepEqual(Utils.omit({ a: 1, b: 2, c: 3 }, ["b"]), { a: 1, c: 3 });
});
