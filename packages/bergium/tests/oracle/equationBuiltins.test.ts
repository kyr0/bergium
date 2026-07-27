import { test, expect } from "vitest";
import { compileEquation } from "../../src/pipelines/milkdrop/port/equationCompiler.js";

/**
 * Why: real butterchurn-presets entries call bitwise builtins by their `bit*`
 * names (e.g. `bitand`), which previously raised `ReferenceError: bitand is not
 * defined` at runtime. The compiled preamble must define both naming conventions
 * (`band`/`bor`/… and `bitand`/`bitor`/…) plus the logical `and`/`or`/`not` and
 * the `if` -> `_if` sanitizer.
 */
test("compiled equations expose the bitwise bit* family (regression: bitand)", () => {
  const run = compileEquation(
    'a.r = bitand(6, 3); a.g = bitor(6, 1); a.b = bitxor(6, 3); a.a = bitnot(0);',
  );
  const out = run({} as Record<string, unknown>);
  expect(out.r).toBe(6 & 3); // 2
  expect(out.g).toBe(6 | 1); // 7
  expect(out.b).toBe(6 ^ 3); // 5
  expect(out.a).toBe(~0); // -1
});

test("compiled equations expose band/bor/bshift and logical and/or/not", () => {
  const run = compileEquation(
    'a.x = band(6, 3); a.y = bor(2, 4); a.z = bshift(1, 3); a.p = and(1, 1); a.q = or(0, 0); a.r = not(5);',
  );
  const out = run({} as Record<string, unknown>);
  expect(out.x).toBe(2);
  expect(out.y).toBe(6);
  expect(out.z).toBe(8);
  expect(out.p).toBe(1);
  expect(out.q).toBe(0);
  expect(out.r).toBe(0);
});

test("milkdrop if(...) is sanitized to _if and resolves to the preamble helper", () => {
  const run = compileEquation("a.v = if(above(3, 1), 10, 20);");
  const out = run({} as Record<string, unknown>);
  expect(out.v).toBe(10);
});

test("math/helpers (pow, clamp, sin, gettime) resolve without ReferenceError", () => {
  const run = compileEquation("a.a = pow(2, 10); a.b = clamp(15, 0, 10); a.c = sin(0);");
  const out = run({} as Record<string, unknown>);
  expect(out.a).toBe(1024);
  expect(out.b).toBe(10);
  expect(out.c).toBe(0);
});
