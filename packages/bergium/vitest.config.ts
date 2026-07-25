import path from "node:path";
import { defineConfig } from "vitest/config";
import { playwright } from "@vitest/browser-playwright";

/**
 * Unified test configuration.
 *
 * - project "node": deterministic CPU-oracle and contract tests, run in Node
 *   with no DOM or GPU. This is the fast default (`bun run test`).
 * - project "browser": real headless Chromium (Playwright) tests that render to a
 *   canvas and exercise a WebGL2 context - the only environment where pixel and
 *   GPU assertions are trustworthy. Run with `bun run test:browser`.
 *
 * `vendor/` holds pinned reference repositories and is excluded everywhere; it is
 * never compiled or executed by this project.
 */
export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "src") },
  },
  test: {
    globals: true,
    testTimeout: 60_000,
    clearMocks: true,
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/vendor/**",
      "**/kitchensink/**",
      "**/__benchmarks__/**",
    ],
    projects: [
      {
        test: {
          name: "node",
          environment: "node",
          include: ["tests/contracts/**/*.test.ts", "tests/oracle/**/*.test.ts"],
        },
      },
      {
        test: {
          name: "browser",
          include: ["tests/browser/**/*.test.ts"],
          browser: {
            enabled: true,
            provider: playwright(),
            headless: true,
            instances: [{ browser: "chromium" }],
          },
        },
      },
    ],
  },
});
