import { test } from "vitest";
import assert from "node:assert/strict";
import {
  chooseMapWaveform,
  activateMode,
  shouldActivateMap,
} from "../../src/pipelines/geiss/reference/ModeStateMachine.js";
import { MsvcRandom } from "../../src/pipelines/geiss/reference/MsvcRandom.js";
import { EFFECT, CLASSIC_MODES } from "../../src/pipelines/geiss/reference/ClassicConfig.js";

// Per docs: these modes forbid specific waveform indices (waveform==7 is unreachable).
const WAVE_EXCLUSIONS: Record<number, readonly number[]> = {
  6: [5],
  12: [4, 6],
  14: [3, 4],
  8: [6],
  23: [6],
  24: [6],
};

test("chooseMapWaveform always returns a reachable 1..6 index", () => {
  for (let mode = 1; mode <= 25; mode++) {
    for (let seed = 1; seed <= 300; seed++) {
      const w = chooseMapWaveform(mode, new MsvcRandom(seed + mode));
      assert.ok(w >= 1 && w <= 6, `mode ${mode} seed ${seed} -> ${w}`);
    }
  }
});

test("chooseMapWaveform honors every documented per-mode exclusion", () => {
  for (const [modeStr, banned] of Object.entries(WAVE_EXCLUSIONS)) {
    const mode = Number(modeStr);
    for (let seed = 1; seed <= 4000; seed++) {
      const w = chooseMapWaveform(mode, new MsvcRandom(seed));
      assert.ok(!banned.includes(w), `mode ${mode} returned banned wave ${w} (seed ${seed})`);
    }
  }
});

test("chooseMapWaveform is deterministic and PRNG-order-stable", () => {
  const a = new MsvcRandom(314);
  const b = new MsvcRandom(314);
  assert.equal(chooseMapWaveform(11, a), chooseMapWaveform(11, b));
  assert.equal(a.snapshot(), b.snapshot());
});

test("activateMode keeps effect count within [min,max] when sound is absent", () => {
  for (let mode = 1; mode <= 25; mode++) {
    const cfg = CLASSIC_MODES[mode - 1]!;
    for (let seed = 1; seed <= 100; seed++) {
      const s = activateMode(mode, 1, false, false, true, new MsvcRandom(seed * 7 + mode));
      const count = [...s.effects].filter((v) => v > 0).length;
      assert.ok(count >= cfg.minEffects && count <= cfg.maxEffects, `mode ${mode} seed ${seed} count ${count}`);
    }
  }
});

test("activateMode: a selected grid always disables bar (source rule)", () => {
  for (let mode = 1; mode <= 25; mode++) {
    for (let seed = 1; seed <= 200; seed++) {
      const s = activateMode(mode, 1, false, false, true, new MsvcRandom(seed * 13 + mode));
      if (s.effects[EFFECT.grid] === 1) assert.equal(s.effects[EFFECT.bar], -1);
    }
  }
});

test("activateMode solarMax doubles for mode 1 true-color (400 -> 800)", () => {
  const s8 = activateMode(1, 1, false, false, true, new MsvcRandom(1));
  const s32 = activateMode(1, 1, true, false, true, new MsvcRandom(1));
  assert.equal(s8.solarMax, 400);
  assert.equal(s32.solarMax, 800);
});

test("activateMode deterministically consumes PRNG in source statement order", () => {
  const a = new MsvcRandom(99);
  const b = new MsvcRandom(99);
  const sa = activateMode(11, 3, false, true, false, a);
  const sb = activateMode(11, 3, false, true, false, b);
  assert.deepEqual([...sa.effects], [...sb.effects]);
  assert.equal(sa.waveform, sb.waveform);
  assert.equal(sa.slideShift, sb.slideShift);
  assert.equal(a.snapshot(), b.snapshot());
});

test("shouldActivateMap gates correctly and decrements threshold by .2/modeFrames", () => {
  assert.equal(shouldActivateMap({ ready: false, threshold: 1 }, true, true, true, 550), false);
  assert.equal(shouldActivateMap({ ready: true, threshold: 1 }, true, true, true, 550), true); // rush
  assert.equal(shouldActivateMap({ ready: true, threshold: 1 }, false, false, false, 550), true); // non-beat
  assert.equal(shouldActivateMap({ ready: true, threshold: 1 }, true, true, false, 550), true); // big beat
  const p = { ready: true, threshold: 1 };
  assert.equal(shouldActivateMap(p, false, true, false, 550), false); // waiting on beat
  assert.equal(p.threshold, 1 - 0.2 / 550);
});
