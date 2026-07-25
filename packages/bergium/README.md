# Bergium

**The element of visual genius.**

Bergium is a proposed TypeScript 7 audio-reactive rendering engine that preserves Butterchurn's public integration surface while supporting multiple renderer pipelines on one canvas:

- a compatibility-oriented MilkDrop/Butterchurn pipeline;
- a faithful Geiss feedback pipeline, extensible into declarative 3D scenes;
- a shared compositor for transitions, post-processing, and text.

The name honors Ryan Geiss, whose Geiss and MilkDrop visualizers established the feedback-warp model behind this project. Public use of his surname should be discussed with him first; the scaffold does not imply endorsement or affiliation.

## Acknowledgement: Jordan Berg

Bergium builds upon the work of **Jordan Berg**, creator and principal developer of **Butterchurn**, the WebGL implementation of the MilkDrop visualizer. Butterchurn demonstrated that MilkDrop’s feedback textures, preset system, waveform rendering, programmable shaders, and audio-reactive behavior could be reproduced faithfully and efficiently in modern browsers.

Bergium preserves Butterchurn’s established integration model and public API while restructuring the implementation around typed renderer pipelines, deterministic timing, shared audio processing, explicit render targets, and a common compositor.

Code derived from Butterchurn retains its applicable copyright attribution and MIT license notice. Bergium is an independent project and does not imply Jordan Berg’s participation, affiliation, or endorsement.

* Butterchurn: [github.com/jberg/butterchurn](https://github.com/jberg/butterchurn)
* Butterchurn website: [butterchurnviz.com](https://butterchurnviz.com/)

## Shared audio-processing foundation

Bergium’s common high-performance audio path builds upon **ringbuf.js**, originally created by **Paul Adenot** for efficient communication between real-time audio and application threads.

In 2025, **Aron Homberg** contributed the upstream modernization of ringbuf.js from JavaScript to TypeScript. This work included updated tooling and types, JIT-oriented loop and memory-copy optimizations, unrolled processing paths, and dedicated benchmarks for copy and deinterleaving performance.

Bergium uses this work as the shared transport layer between `AudioWorklet`, audio analysis, and its renderer pipelines. MilkDrop-compatible and feedback-based renderers therefore consume the same timestamped, normalized audio frames without duplicating browser audio handling or introducing allocations into the real-time callback.

* ringbuf.js: [github.com/padenot/ringbuf.js](https://github.com/padenot/ringbuf.js)
* TypeScript and performance modernization: [commit d55cb9a](https://github.com/padenot/ringbuf.js/commit/d55cb9a5d3ad84933cc9e7a84da5b558e75a90e8)

## The name "Bergium"

The name **Bergium** combines **Berg** with the chemical-element suffix **-ium**.

“Berg” is derived from the surname of project creator **Aron Homberg**. It also provides a deliberate secondary acknowledgement of **Jordan Berg**, whose Butterchurn implementation forms Bergium’s browser-rendering foundation.

The suffix “-ium” presents Bergium metaphorically as a new technical element: a reusable foundation combining high-performance audio transport, audio analysis, feedback rendering, multiple visualization pipelines, compositing, text rendering, and declarative presets.

The name consequently represents a real continuity of contributions:

> **Geiss established the visual principles. Berg brought them to the modern browser. Homberg contributed the shared high-performance audio foundation and unified both lineages into Bergium.**

Neither the project name nor these acknowledgements imply endorsement or official involvement by Ryan Geiss, Jordan Berg, or Paul Adenot.

## Acknowledgement: Ryan Geiss

Bergium exists because of the pioneering work of **Ryan M. Geiss**, creator of **Geiss** and **MilkDrop**. Ryan established and refined the recursive feedback-warp rendering techniques, audio-reactive waveform integration, transformation maps, palette dynamics, interpolation behavior, and visual principles that inspired Bergium’s classic feedback-rendering pipeline.

The implementation is informed by Ryan’s published technical explanation, *How Geiss Worked*, and the openly released Geiss source code. All directly adapted or ported code retains its applicable copyright attribution and BSD-3-Clause license notice.

Bergium is an independent project and is neither an official successor to nor affiliated with or endorsed by Ryan Geiss. The project name deliberately does not use his surname; his contribution is honored through explicit technical attribution, source provenance, and preservation of the history behind these algorithms.

* Ryan Geiss: [geisswerks.com](https://www.geisswerks.com/)
* Geiss source code: [github.com/geissomatik/geiss](https://github.com/geissomatik/geiss)
* Technical history: [How Geiss Worked](https://www.geisswerks.com/geiss/secrets.html)

## Primer

Bergium treats a visualizer as a small real-time system:

```text
audio source -> normalized AudioFrame -> renderer pipeline -> texture
                                                        textures -> compositor -> canvas
text/events --------------------------------------------/
```

The renderer pipelines share exactly one WebGL2 context. They never present directly when composition is active. Each pipeline renders to a `RenderTarget`; the compositor blends targets, applies presentation effects, renders text, and presents to the canvas.

This permits MilkDrop-to-Geiss transitions, common text rendering, deterministic offline rendering, and future pipelines without rewriting host integrations.

## Compatibility promise

Existing consumers such as Webamp should continue to work through the familiar API:

```ts
import { createVisualizer } from "bergium-core";

const visualizer = createVisualizer(audioContext, canvas, {
  width: 800,
  height: 600,
});

visualizer.connectAudio(audioNode);
visualizer.loadPreset(existingMilkDropPreset, 0);
visualizer.render();
```

The extended API adds lifecycle and pipeline-neutral capabilities without changing those calls:

```ts
visualizer.disconnectAudio();
visualizer.loadPreset(bergiumPreset, 2.7);
visualizer.launchSongTitleAnim("Artist - Track");
visualizer.destroy();
```

## Core invariants

1. **One canvas, one graphics context.** Pipelines receive targets; they do not create contexts.
2. **One audio model.** Pipelines consume immutable `AudioFrame` values, never browser audio nodes.
3. **Simulation is fixed-step.** Display refresh rate must not alter feedback decay or motion.
4. **Colorization is presentation.** Faithful classic Geiss retains scalar intensity feedback and applies the palette at output.
5. **Presets are data.** New Bergium presets are versioned, declarative JSON—not executable JavaScript or arbitrary GLSL.
6. **Composition is centralized.** Cross-pipeline transitions and crisp overlay text belong to the compositor.

## Classic compatibility preset

Classic presets select source behavior. They do not restate it as approximate
free-form warp parameters:

```json
{
  "format": "bergium",
  "version": 1,
  "pipeline": "geiss-classic",
  "name": "Geiss 4.30 mode 11",
  "simulation": { "hz": 30, "seed": 42 },
  "profile": "geiss-4.30-plugin-8bit",
  "mode": 11,
  "options": { "beatDetection": true, "slideShift": true }
}
```

## 3D extension preset

```json
{
  "$schema": "https://bergium.dev/schema/preset-v1.json",
  "format": "bergium",
  "version": 1,
  "pipeline": "geiss-3d",
  "name": "Chromatic Vortex",
  "simulation": { "hz": 30, "seed": 42 },
  "feedback": { "decay": 0.985, "format": "intensity8" },
  "warp": { "kind": "vortex", "strength": 0.12 },
  "waveforms": [{ "kind": "line", "layer": "post-warp" }],
  "particles": [{ "kind": "solar", "layer": "pre-warp", "count": 256 }],
  "post": { "palette": "geiss-classic", "gamma": 1.1 },
  "text": { "layer": "overlay" }
}
```

## Repository map

```text
src/api/          Butterchurn-compatible and extended public contracts
src/audio/        Audio adapters and normalized frame model
src/core/         Runtime/orchestration boundary
src/graphics/     Shared device and render-target contracts
src/pipelines/    MilkDrop and Geiss pipeline boundaries
src/compositor/   Cross-pipeline blending and presentation
src/presets/      Versioned preset types and JSON Schema
src/text/         Shared feedback/overlay text abstraction
src/worklets/     AudioWorklet capture boundary
docs/             Source-pinned Geiss and Butterchurn behavior contracts
tests/contracts/  Compatibility and architectural contract tests
tests/oracle/     Deterministic CPU-oracle fixtures (PRNG, modes, maps, warp, palette, waves, audio)
tests/browser/    Headless-Chromium rendering tests (2D canvas pixel + WebGL2 device)
```

Read [implementation_plan.md](./implementation_plan.md), then
[docs/geiss-reference.md](./docs/geiss-reference.md) and
[docs/butterchurn-drift-guard.md](./docs/butterchurn-drift-guard.md).

## Verifying

Tests run on [Vitest](https://vitest.dev) with two projects (see
[`vitest.config.ts`](./vitest.config.ts)):

- **node** — the deterministic CPU-oracle and contract tests (no DOM or GPU). This
  is the fast default (`bun run test`).
- **browser** — real headless Chromium via Playwright, where canvas pixel
  assertions and a WebGL2 device are trustworthy. Run it with
  `bun run test:browser`; Playwright fetches the Chromium binary automatically on
  first use (`bunx playwright install chromium`).

```sh
bun install                       # dev dependencies
bun run test                      # node project (contracts + CPU-oracle fixtures)
bun run test:browser              # headless Chromium (canvas + WebGL2)
bun run test:all                  # both projects
bun run typecheck                 # tsc --noEmit over src + tests + vitest config
bun run build                     # emit dist/
```

The oracle fixtures lock the exact-profile invariants the plan names for Phase 4:
the MSVC `rand()` sequence, the 25-mode threshold table and true-color deltas,
per-mode waveform exclusions, effect-count and grid-disables-bar rules, the
four-tap byte-weight feedback warp (`>>> 8`), the destination-to-source map
quantization with X-wrap/Y-clamp, palette curve/blending, all six waveforms, the
normative pass order, and the 8-bit Geiss audio analyzer state.

## Status

Bergium is a TypeScript-first engine, not just a spec. It includes source-derived
Geiss oracles (ring transport, audio state, classic mode selection, map generation,
integer feedback warp, palette, six waveforms, normative pass scheduler, fixed-step
`FrameClock` and `diminishCenter`) — gated by the deterministic fixtures in
`tests/oracle/` (Phase 4) — plus the concrete WebGL2 `WebGLGraphicsDevice` and the
classic GPU pipeline (Phase 5), each pass verified **byte-for-byte against its CPU
oracle** in headless Chromium: integer feedback warp (`GeissGpuWarp`), palette-LUT
presentation (`GeissPalettePresent`), pre/post-warp integer injection (`GeissInject`,
max + saturating add), the six waveforms (`GeissWaveform`, max-blend), and
`diminishCenter` (`GeissDiminishCenter`). These are assembled by
`GeissGpuFrameGraph` into the full normative order over a ping-pong feedback loop
(pre-warp inject → diminish → warp → post-warp inject+waveform → swap → palette),
verified against the CPU oracle every frame. Phase 1 (Freeze Butterchurn) is
complete: every Butterchurn module is now a TypeScript-native port (see
`src/pipelines/milkdrop/port/`), wired into the API via
`createVisualizer(…, { pipeline: "milkdrop" })`. A headless-Chromium test
verifies the Webamp API surface and captures a golden snapshot of a rendering
preset. Remaining work — redirecting Butterchurn's present to the Compositor
(Phase 2), live audio (Phase 3), and the 3D/text extensions — is laid out in the
plan with its gates fixed.

## Fidelity warning

This is not a legally isolated clean-room implementation: the Geiss source was
read deliberately. It is an independently expressed, attributed BSD-licensed
behavioral port. “Exact” always names a profile and fixture; browser/GPU behavior
outside that profile is not mislabeled as pixel identity. See
[docs/provenance.md](./docs/provenance.md).

## Prior art and credits

- [Geiss source](https://github.com/geissomatik/geiss), BSD-3-Clause
- [How Geiss Worked](https://www.geisswerks.com/geiss/secrets.html)
- [Butterchurn](https://github.com/jberg/butterchurn), MIT
- [Webamp](https://github.com/captbaritone/webamp)
- [ringbuf.js](https://github.com/padenot/ringbuf.js), including Aron Homberg's TypeScript modernization
- [Milky.js](https://github.com/kyr0/Milky.js), the exploratory C/Wasm feedback implementation
- [MilkDrop3](https://github.com/milkdrop2077/MilkDrop3), MilkDrop 3.0, supports any audio source, double-preset (.milk2), loading presets based on beat detection and much more...
