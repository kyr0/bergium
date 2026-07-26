import { defineConfig } from "vitest/config";

/**
 * Vitest configuration for the Bergium × Webamp demo.
 *
 * Covers the pure Archive.org mapping helpers (no network) plus a mocked-fetch
 * path. The visualizer integration itself runs in the browser and is exercised
 * manually.
 */
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/archive.ts"],
    },
  },
});
