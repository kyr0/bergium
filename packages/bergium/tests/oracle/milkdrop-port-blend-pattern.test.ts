import { test } from "vitest";
import assert from "node:assert/strict";
import { initializeRNG, cleanup } from "../../src/pipelines/milkdrop/port/rngContext.js";
import BlendPattern from "../../src/pipelines/milkdrop/port/blendPattern.js";

// rngContext.initializeRNG touches the host global; point `window` at globalThis
// for the node test run (=== window in a browser).
(globalThis as unknown as Record<string, unknown>).window = globalThis;

// Goldens captured from the vendored source (seeded RNG, mesh 8x6, aspect 1).
const A0_4 = [6.777597, 6.777597, 6.777597, 6.777597, 6.777597];
const C0_4 = [-4.051175, -3.571733, -3.240711, -2.932849, -2.495988];
const r6 = (a: Float32Array, n: number): number[] => {
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(+a[i]!.toFixed(6));
  return out;
};

test("ported BlendPattern matches vendored (seeded blend field + resizeMatrixValues)", () => {
  initializeRNG({ deterministic: true, seed: 1 });
  try {
    const bp = new BlendPattern({ mesh_width: 8, mesh_height: 6, aspectx: 1, aspecty: 1 });
    assert.equal(bp.vertInfoA.length, 63); // (8+1)*(6+1)
    assert.deepEqual(r6(bp.vertInfoA, 5), A0_4);
    assert.deepEqual(r6(bp.vertInfoC, 5), C0_4);

    const resized = BlendPattern.resizeMatrixValues(new Float32Array([0, 1, 2, 3]), 1, 1, 2, 2);
    assert.deepEqual([...resized], [0, 0, 0, 0, 0, 0, 0, 0, 0]);
  } finally {
    cleanup();
  }
});
