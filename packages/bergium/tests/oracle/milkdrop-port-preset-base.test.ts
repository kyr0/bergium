import { test } from "vitest";
import assert from "node:assert/strict";
import "./../../src/pipelines/milkdrop/port/presetBase.js";
import {
  sqr, sqrt, log10, sign, bnot, pow, div, mod, bitor, bitand,
  sigmoid, bor, band, equal, above, below, ifcond, memcpy, rand, randint,
} from "../../src/pipelines/milkdrop/port/presetBase.js";

const g = globalThis as unknown as Record<string, (...a: number[]) => number>;

test("ported EEL math globals match the vendored presetBase behavior", () => {
  assert.equal(sqr(3), 9);
  assert.equal(sqr(-2), 4);
  assert.equal(sqrt(-4), 2); // sqrt(|x|)
  assert.equal(sqrt(9), 3);
  assert.ok(Math.abs(log10(1000) - 3) < 1e-9);
  assert.equal(sign(-5), -1);
  assert.equal(sign(0), 0);
  assert.equal(sign(5), 1);

  assert.equal(bnot(0), 1);
  assert.equal(bnot(0.0001), 0); // < EPSILON
  assert.equal(bnot(1), 0);

  assert.equal(pow(2, 10), 1024);
  assert.equal(pow(-1, 0.5), 0); // complex result -> 0
  assert.equal(pow(2, 0), 1);

  assert.equal(div(5, 0), 0);
  assert.equal(div(10, 2), 5);

  assert.equal(mod(7, 3), 1);
  assert.equal(mod(5, 0), 0);
  assert.equal(mod(-7, 3), -1); // Math.floor(-7) % 3 == -1
});

test("ported EEL bitwise/logical/select globals match the vendored behavior", () => {
  assert.equal(bitor(1, 2), 3);
  assert.equal(bitor(1.5, 2.5), 3); // floor first
  assert.equal(bitand(3, 2), 2);
  assert.equal(sigmoid(0, 1), 0.5);

  assert.equal(bor(0, 0), 0);
  assert.equal(bor(0.000001, 0), 0); // below EPSILON (0.00001)
  assert.equal(bor(0.0001, 0), 1); // above EPSILON
  assert.equal(bor(1, 0), 1);
  assert.equal(band(1, 1), 1);
  assert.equal(band(1, 0), 0);

  assert.equal(equal(1, 1.000001), 1); // within EPSILON
  assert.equal(equal(1, 2), 0);
  assert.equal(above(2, 1), 1);
  assert.equal(above(1, 2), 0);
  assert.equal(below(1, 2), 1);
  assert.equal(below(2, 1), 0);
  assert.equal(ifcond(1, 10, 20), 10);
  assert.equal(ifcond(0, 10, 20), 20);
});

test("ported memcpy matches the vendored copyWithin call", () => {
  const buf = [1, 2, 3, 4, 5];
  const dst = memcpy(buf, 2, 0, 2); // copyWithin(2, 0, 2)
  assert.equal(dst, 2);
  assert.deepEqual(buf, [1, 2, 1, 2, 5]);
});

test("ported rand/randint ranges (Math.random default)", () => {
  for (let i = 0; i < 50; i++) {
    const r = rand(5);
    assert.ok(r >= 0 && r < 5, `rand(5)=${r}`);
    const ri = randint(5);
    assert.ok(ri >= 0 && ri <= 4, `randint(5)=${ri}`);
    assert.ok(rand(0.5) >= 0 && rand(0.5) < 1); // max<1 -> Math.random()
  }
});

test("presetBase installs the EEL globals on the host global object (side-effect import)", () => {
  assert.equal(g.sqr!(3), 9);
  assert.equal(g.above!(2, 1), 1);
  assert.equal(typeof g.memcpy, "function");
});
