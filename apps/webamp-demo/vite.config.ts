import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

/**
 * Vite configuration for the Bergium × Webamp demo.
 *
 * Webamp is consumed from our vendored fork (`packages/webamp-bergium`) via the
 * pre-built, self-contained bundles. `webamp/butterchurn` is the entry that now
 * injects bergium-core as Webamp's visualizer (Geiss + Milkdrop, click-to-toggle).
 *
 * bergium-core is EXTERNAL to the webamp bundle (its GLSL `?raw` assets can't be
 * inlined). The bundle's `import "bergium-core"` would otherwise resolve to the
 * fork's `file:`-copied bergium-core (which lacks the `.glsl` files), so we alias
 * it to the bun-workspace bergium-core's built entry — whose `?raw` imports Vite's
 * regular pipeline handles (NOT `optimizeDeps`, which can't load `?raw`).
 *
 * Prerequisite: build bergium-core + the fork bundles first — `bun run build:webamp-bergium`.
 */
const here = import.meta.url;
const forkBundle = (file: string): string =>
  fileURLToPath(new URL(`../../packages/webamp-bergium/packages/webamp/built/${file}`, here));
// Outer bun-workspace bergium-core built entry (has dist + GLSL `?raw` assets).
const bergiumCoreEntry = fileURLToPath(new URL(`../../packages/bergium/dist/index.js`, here));

export default defineConfig({
  server: {
    port: 5174,
  },
  build: {
    outDir: "dist",
    sourcemap: true,
    chunkSizeWarningLimit: 2500,
  },
  resolve: {
    alias: [
      // Force bergium-core to the workspace copy (with GLSL assets), not the fork's file: copy.
      { find: "bergium-core", replacement: bergiumCoreEntry },
      // Most-specific first: the demo imports `webamp/butterchurn`.
      { find: "webamp/butterchurn", replacement: forkBundle("webamp.butterchurn-bundle.min.mjs") },
      { find: "webamp", replacement: forkBundle("webamp.bundle.min.mjs") },
    ],
  },
  optimizeDeps: {
    // butterchurn-presets is CJS/UMD and benefits from pre-bundling.
    // NOTE: do NOT add bergium-core here — its `*.glsl?raw` imports can't be loaded
    // by the rolldown dep optimizer; Vite's normal pipeline handles them instead.
    include: ["butterchurn-presets"],
  },
});
