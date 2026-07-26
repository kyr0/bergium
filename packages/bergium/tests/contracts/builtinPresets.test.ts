import { test, expect, vi } from "vitest";
import { getBuiltinPresets, CUSTOM_PRESETS, DISABLED_PRESET_NAMES } from "../../src/index.js";

/**
 * The built-in preset registry must always yield the bergium-authored presets and the
 * Blank preset, even when the optional `butterchurn-presets` dependency is absent, and
 * must filter known-broken presets when it is present.
 */
test("getBuiltinPresets returns bergium presets without butterchurn-presets installed", async () => {
  // butterchurn-presets is not installed in this project's node test environment, so the
  // lazy import inside getBuiltinPresets throws and is swallowed gracefully.
  const presets = await getBuiltinPresets();
  const names = presets.map((p) => p.name);

  expect(names).toContain("Bergium Blank");
  for (const custom of CUSTOM_PRESETS) {
    expect(names).toContain(custom.name);
  }
  // Every entry is named and carries a preset object.
  for (const entry of presets) {
    expect(typeof entry.name).toBe("string");
    expect(entry.name.length).toBeGreaterThan(0);
    expect(entry.preset).toBeDefined();
  }
});

test("getBuiltinPresets filters known-broken butterchurn presets", async () => {
  vi.doMock("butterchurn-presets", () => {
    const lib = {
      getPresets: () => ({
        "martin - The bridge": { broken: true },
        "Idiot - Star Of Annon": { broken: true },
        "Good Preset": { ok: true },
      }),
    };
    return { default: lib, getPresets: lib.getPresets };
  });

  // Re-import a fresh module graph so the doMock takes effect for the dynamic import.
  vi.resetModules();
  const { getBuiltinPresets: fresh } = await import("../../src/presets/builtin/index.js");
  const presets = await fresh();
  const names = presets.map((p) => p.name);

  expect(names).toContain("Good Preset");
  expect(names).not.toContain("martin - The bridge");
  expect(names).not.toContain("Idiot - Star Of Annon");
  // Sorted alphabetically after the bergium-authored head.
  const tail = names.slice(names.indexOf("Good Preset"));
  expect(tail).toEqual([...tail].sort());

  vi.doUnmock("butterchurn-presets");
  vi.resetModules();
});

test("DISABLED_PRESET_NAMES is a non-empty frozen set", () => {
  expect(DISABLED_PRESET_NAMES.size).toBeGreaterThan(0);
  expect(DISABLED_PRESET_NAMES.has("martin - The bridge")).toBe(true);
});
