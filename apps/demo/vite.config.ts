import { defineConfig } from "vite";

/**
 * Vite configuration for the Bergium demo.
 *
 * Serves a full-screen canvas visualizer backed by the milkdrop pipeline
 * (the TypeScript-native butterchurn port in bergium-core).
 *
 * Audio is served from the repository root (../../sample_data/ from this config).
 */
export default defineConfig({
  server: {
    port: 5173,
  },
  build: {
    outDir: "dist",
    sourcemap: true,
  },
  optimizeDeps: {
    // butterchurn-presets is a CJS UMD webpack bundle — force Vite to pre-bundle it
    include: ["butterchurn-presets"],
  },
});
