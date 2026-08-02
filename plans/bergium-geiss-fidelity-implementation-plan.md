# Bergium: Geiss 4.30 Near-Absolute-Fidelity Implementation Plan

**Status:** implementation-ready  
**Target source:** `geissomatik/geiss` revision `fcc6d57444fc28293894d8de6f0281ca3308ae38`  
**Primary profile:** `geiss-4.30-plugin-8bit-x86-exact`  
**Secondary profiles:** browser-host compatibility, GPU-fast, and later 32-bit true-color  
**Core principle:** preserve original state transitions and byte behavior first; optimize only behind exact parity gates.

---

## 1. Executive decision

The current Bergium code already contains useful source-derived components—MSVC-compatible randomness, map formulas, waveform geometry, audio-state logic, an integer WebGL warp, and a GPU frame graph. The live `GeissAdapter`, however, bypasses much of that work and currently executes a simplified visualizer:

- 9 rather than 25 modes;
- one mono waveform rather than the six reachable source waveforms;
- simplified ShadeBobs, Chasers, and Grid;
- no complete Bar, Dot Chaser, Solar, or Nuclide behavior;
- a different RNG initialization and consumption schedule;
- immediate whole-map generation rather than source-timed chunking;
- a gradient seed instead of zeroed feedback buffers;
- waveform injection before rather than after the warp;
- Canvas2D readback/presentation and unrelated title animation.

The correction should **not** attempt to patch these differences inside the adapter one at a time. It should replace the adapter’s ad-hoc simulation with a versioned classic engine whose behavior is independently testable.

### Chosen architecture

```text
AudioWorklet / deterministic fixture input
                  │
                  ▼
       Geiss host-input adapter
                  │
                  ▼
    GeissClassicSimulation (source order)
      ├─ one global MSVC RNG timeline
      ├─ mode and palette state
      ├─ chunked map construction
      ├─ exact ordered effects
      ├─ exact x86-compatible 8-bit warp
      ├─ audio, dots, and six waveforms
      └─ title lifecycle
                  │
                  ▼
       Uint8 scalar feedback frame
                  │  texSubImage2D, no readback
                  ▼
      WebGL2 palette/presentation/compositor
                  │
                  ▼
             visible canvas
```

The first exact runtime backend should be a **packed, allocation-free typed-array implementation**. Modern JavaScript engines already JIT this form effectively. WebGL remains the renderer and compositor; it directly presents the scalar intensity frame through a palette LUT and scales it to any display resolution.

The existing all-GPU frame graph remains valuable, but it becomes `geiss-gpu-fast` until every pass proves exact parity. Several original effects are ordered read/modify/write algorithms that cannot be represented exactly by one generic “contribution texture + max/add blend” abstraction. The active 8-bit x86 warp also has pairwise accumulator behavior that a normal independent-per-fragment shader does not reproduce.

This architecture gives the best combination:

- **faithfulness:** source-shaped CPU semantics and native golden fixtures;
- **speed:** compact typed arrays, no per-frame allocations, no GPU readback;
- **WebGL retention:** LUT colorization, scaling, composition, transition, and optional later exact GPU passes;
- **auditability:** every optimization is compared against the readable oracle.

---

## 2. Fidelity contract

“Almost absolutely faithful” must be defined precisely. It cannot honestly mean that every browser reproduces every host-dependent Winamp, GDI, DirectDraw, CRT, and old x86 detail without qualification.

### 2.1 Fidelity classes

| Class | Meaning | Acceptance |
|---|---|---|
| **NATIVE-EXACT** | Reproduces the active pinned Windows/x86 source path for declared inputs and host profile. | Exact state, RNG, map, and byte-buffer equality. |
| **SOURCE-EXACT** | Reproduces reachable source statement order and declared C conversion semantics where the native host is not observable or stable. | Exact deterministic fixture equality. |
| **HOST-DECLARED** | Original behavior is provided by Winamp, GDI, DirectDraw, CRT/libm, installed fonts, or timing. Bergium pins and documents a replacement. | Exact within that declared replacement profile. |
| **MODERN-EQUIVALENT** | Different mechanism, identical observable result. | Exact intermediate output equality. |
| **EXTENSION** | New Bergium behavior. It must never silently affect a classic profile. | Independent tests; no classic-fixture delta. |

### 2.2 Exact-profile identity

Every replayable result is identified by:

```ts
interface GeissProfileIdentity {
  engine: "geiss";
  sourceRevision: "fcc6d57444fc28293894d8de6f0281ca3308ae38";
  profile:
    | "geiss-4.30-plugin-8bit-x86-exact"
    | "geiss-4.30-plugin-8bit-portable"
    | "geiss-4.30-plugin-32bit-exact"
    | "geiss-gpu-fast";
  width: number;
  height: number;
  displayBits: 8 | 32;
  simulationHz: number;
  sampleRate: 44100;
  seed: number;
  hostAudioProfile: string;
  hostMathProfile: string;
  hostTextProfile: string;
  optionsHash: string;
}
```

A result without this identity must not be labeled exact.

### 2.3 Non-negotiable rules

1. One global RNG stream owns all classic randomness.
2. RNG call count and order are part of the output.
3. Simulation time is independent of display refresh rate.
4. Source statement order is preserved.
5. C casts, wrapping, truncation, and threshold comparisons are explicit.
6. Scalar 8-bit intensity remains the feedback state; palette RGB never feeds back.
7. Classic extensions are opt-in and cannot alter exact fixtures.
8. Visual similarity is supplementary evidence, never the main oracle.
9. No optimization lands without exact intermediate-buffer parity.
10. Host-defined gaps are documented, versioned, and measurable—not hidden.

---

## 3. Findings that materially change the implementation

### 3.1 Current negative-coordinate map behavior is intentionally non-source-faithful

The current map test uses `Math.floor()` to keep fractional weights convex for negative coordinates. The C source uses `(int)newx` and `(int)newy`, which truncate toward zero, then casts independently computed weights to `unsigned char`. Negative fractional weights can therefore wrap. The exact profile must preserve the source behavior, even where it looks like a defect.

Action:

- keep the current safe behavior only under `geiss-gpu-fast`;
- implement C truncation and byte wrapping under exact profiles;
- freeze adversarial fixtures around negative mapped coordinates.

### 3.2 Map generation must remain chunked

The original builds a pending map over many frames, based on `frames_crunching_this_mode / frames_til_auto_switch`. This is not merely a latency optimization:

- mode 14 consumes `rand()` per generated pixel;
- map RNG therefore interleaves with effects, palette, titles, and audio-triggered RNG;
- generating the entire map immediately changes every later random decision.

Action: preserve the exact per-frame map-generation budget and activation rules. A Worker may calculate arithmetic, but the central timeline must allocate all random values in the exact source order.

### 3.3 The active 8-bit warp is not the clean C fallback

The source calls dynamically patched x86 assembly. Its 8-bit loop:

- processes only active inner rows;
- adds `slider1` to the source pointer;
- evaluates two destination pixels per loop;
- seeds the first pixel’s low accumulator byte from the low byte of its relative map delta;
- clears only the high byte between the pair, so the second pixel inherits the first pixel’s low remainder.

This behavior differs from both a clean `sum >> 8` per pixel and the current independent-fragment shader.

Action:

- capture assembly output in the native oracle;
- implement an explicit two-pixel warp kernel for the x86-exact profile;
- retain a separately named portable profile for the clean C fallback;
- do not call an independent-per-pixel GPU warp x86-exact.

### 3.4 Exact effects cannot share one blend primitive

Examples from the source:

- ShadeBobs: conditional `+1/+2` below 250;
- Chasers: nonlinear `255 - (255-v)*0.6`;
- Bar: conditional increment below a threshold;
- Dot Chaser: direct assignment plus persistent history movement;
- Nuclide: saturating addition;
- Grid: maximum write;
- Solar: conditional center writes and neighboring byte increments;
- Diminish: thresholded multiply with repeated center writes.

These operations are ordered and overlap. A precomputed contribution image loses the effect of earlier writes on later writes.

Action: implement exact effects as direct ordered mutations in the reference and fast typed-array backends. GPU versions need a dedicated parity design per effect and cannot reuse a generic approximate injection pass.

### 3.5 Audio has two fidelity layers

The Geiss plugin consumes Winamp-provided `waveformData[2][576]` and `spectrumData[2][576]`. Exact classic simulation can be achieved for supplied Winamp input buffers. Reconstructing those exact host buffers from arbitrary browser PCM is a separate host-emulation problem.

Action:

- define `WinampVisualizationFrame` as the exact engine input;
- make all native fixtures use those buffers directly;
- build a versioned browser PCM adapter;
- probe a pinned Winamp version with synthetic lossless audio to calibrate buffer timing, quantization, and spectrum mapping;
- label browser PCM conversion `HOST-DECLARED` until it matches the pinned host corpus.

### 3.6 Text has two destinations and one host-dependent rasterizer

Original title behavior includes:

- GDI font selection with a null face name;
- GDI text measurement;
- four-sample random position distributions;
- dark one-pixel shadow and 225-valued foreground;
- an early phase copied into the scalar feedback state;
- later overlay rendering after presentation.

Font selection and glyph rasterization depend on installed Windows fonts and GDI.

Action:

- make lifecycle, RNG, placement, thresholds, and feedback injection source-exact;
- define a pinned open-font deterministic browser profile;
- retain Windows/GDI native title-mask fixtures;
- classify glyph-pixel identity as host-declared unless the same font/rasterizer is available.

### 3.7 Palette handling needs source-order verification

The original special palettes assign red, blue, and green through distinct arrays. The current TypeScript special-palette vector construction is easy to misread and likely has channel-order drift. The source also decrements palette-blend state in both `RenderFX()` and `PutPalette()` while blending is active.

Action:

- fixture every special palette and random curve combination;
- preserve the reachable double-decrement quirk;
- verify palette state separately from final RGB presentation.

---

## 4. Target repository structure

```text
packages/bergium/
  src/pipelines/geiss/
    classic/
      GeissClassicEngine.ts
      GeissClassicProfile.ts
      GeissClassicState.ts
      GeissClassicOptions.ts
      GeissFrameScheduler.ts
      GeissInitialization.ts
      GeissRandomTimeline.ts
      GeissNumeric.ts
      GeissMath32.ts

      audio/
        WinampVisualizationFrame.ts
        GeissAudioOracle.ts
        BrowserWinampAdapter.ts
        RecordedWinampAdapter.ts

      mode/
        GeissModeOracle.ts
        GeissEffectSelection.ts
        GeissModeTables.ts

      map/
        GeissMapState.ts
        GeissMapParameters.ts
        GeissMapOracle.ts
        GeissMapChunker.ts
        GeissMapActivation.ts
        GeissWarp8X86Oracle.ts
        GeissWarp8PortableOracle.ts

      effects/
        ShadeBobs.ts
        TwoChasers.ts
        SolidBar.ts
        DotChaser.ts
        NuclidePreWarp.ts
        SolarParticles.ts
        Grid.ts
        DiminishCenter.ts
        EffectsFrame.ts

      post/
        RenderDots.ts
        NuclidePostWarp.ts
        Waveforms.ts

      palette/
        GeissPaletteOracle.ts
        GeissPaletteState.ts

      title/
        GeissTitleState.ts
        GeissTitleLayout.ts
        GeissTitleMask.ts

      backend/
        GeissReferenceBackend.ts
        GeissTypedArrayBackend.ts
        GeissWasmBackend.ts          # optional, gated
        GeissGpuFastBackend.ts

    present/
      GeissWebGLPresenter.ts
      GeissPaletteLut.ts
      GeissTitleCompositor.ts

  tests/geiss/
    native-fixtures/
    oracle/
    backend-parity/
    browser/
    performance/

tools/
  geiss-native-oracle/
  winamp-host-probe/
  geiss-fixture-tools/
```

### Responsibility split

| Component | Owns | Must not own |
|---|---|---|
| `GeissClassicEngine` | source-order state transition | canvas or host audio capture |
| `GeissRandomTimeline` | all random calls and checkpoints | independent subsystem streams |
| `GeissReferenceBackend` | readable direct source translation | performance-specific shortcuts |
| `GeissTypedArrayBackend` | optimized exact mutation | changed semantics |
| `BrowserWinampAdapter` | browser PCM → host frame | classic engine state |
| `GeissWebGLPresenter` | texture upload, LUT, scaling, composition | simulation |
| `GeissGpuFastBackend` | optional fast visual profile | exact branding |
| Native oracle | fixture generation and source comparison | production dependency |

---

## 5. Normative 8-bit frame order

The classic engine must expose stage hooks around this exact order:

```text
1. Advance floatframe, intframe, frames_this_mode.
2. Advance clear and palette state.
3. Continue pending-map generation for this frame.
4. Execute pre-warp effects in source order:
   a. ShadeBobs
   b. Two Chasers
   c. Solid Bar
   d. Dot Chaser
   e. pre-warp Nuclide
   f. Grid
   g. Solar particles
   h. Diminish Center
5. Process the active map over active rows:
   - slider1 source shift
   - x86 pairwise accumulator semantics
6. Convert current host audio frame into g_fSoundBuffer.
7. Run RenderDots:
   - volume/history/beat/title state
   - post-warp audio-triggered Nuclide
   - slide-shift state
8. Draw the selected waveform, including stereo/spectrum variants.
9. Swap VS1 and VS2.
10. Check title transition state.
11. Title phase 0:
    - rasterize to scratch surface
    - threshold and inject into scalar feedback when required
12. Palette conversion and WebGL presentation.
13. Title phase 1 overlay.
14. Expose final state and stage digests.
```

No adapter or GPU backend may reorder these operations.

---

# 6. Incremental implementation roadmap

Every phase below is intentionally small. Each phase should land as one or several reviewable commits with its own verification gate.

## Phase 0 — Freeze and isolate the current behavior

### Goal

Make the existing implementation reproducible before replacing it.

### Steps

0.1. Add a `geissBackend` option:

```ts
type GeissBackend =
  | "legacy-prototype"
  | "classic-reference"
  | "classic-fast"
  | "gpu-fast";
```

0.2. Keep the current adapter available as `legacy-prototype`; stop describing it as faithful.

0.3. Capture screenshots and frame hashes for the current demo at:

- 320×240;
- 640×480;
- 1280×960;
- silence;
- deterministic sine input;
- one recorded music fixture.

0.4. Record current performance:

- CPU frame time;
- GPU time where available;
- `readPixels` time;
- allocations/frame;
- upload/readback bytes/frame.

0.5. Add a debug overlay exposing backend, profile, seed, mode, waveform, frame, and RNG count.

### Verification

- Existing demo behavior remains unchanged under `legacy-prototype`.
- No classic-reference code is reachable yet.
- Baseline artifacts are checked in or stored as CI artifacts.

### Exit gate

The current implementation is frozen and can be compared throughout the migration.

---

## Phase 1 — Pin provenance, profiles, and licensing

### Goal

Remove ambiguity about what is being replicated.

### Steps

1.1. Update `docs/provenance.md` to name:

- pinned Geiss revision;
- authoritative active files: `main.cpp`, `Effects.h`, `video.h`, `proc_map.cpp`, `VIS.H`;
- `SOUND.CPP` as historical/non-authoritative where it differs;
- target compiler architecture: Windows x86;
- exact and host-declared boundaries.

1.2. Add source-location annotations to each ported function:

```ts
/**
 * Source: geiss fcc6d57, Effects.h::ShadeBobs
 * Profile: 8-bit and 32-bit
 * Fidelity: SOURCE-EXACT
 */
```

1.3. Preserve the Geiss BSD-3-Clause notice in all directly adapted files and distributions.

1.4. Add a generated `geiss-source-index.json` mapping source symbols to Bergium modules and tests.

1.5. Replace vague “faithful” wording with profile-specific claims.

### Verification

- Every classic module references a pinned source symbol.
- License scanner verifies required notices.
- Documentation contains no unqualified pixel-exact claim.

### Exit gate

A reviewer can determine exactly which source and behavior every classic module implements.

---

## Phase 2 — Build the native Windows/x86 oracle

### Goal

Create authoritative, deterministic outputs from the active source path.

### Steps

2.1. Create `tools/geiss-native-oracle` as a test-only x86 MSVC project.

2.2. Compile the pinned source with minimal conditional hooks:

```cpp
#ifdef BERGIUM_ORACLE
  #define rand   bergium_rand
  #define srand  bergium_srand
  #define clock  bergium_clock
#endif
```

2.3. Implement an MSVC-LCG wrapper whose sequence is tested against CRT `rand()`.

2.4. Add deterministic injection for:

- seed;
- FPS and clock;
- width/height/display bits;
- options and mode preferences;
- Winamp waveform and spectrum arrays;
- title events;
- forced mode/effect scenarios.

2.5. Add stage dump hooks without changing operation order:

- after initialization;
- after mode selection;
- after each map chunk;
- after each pre-warp effect;
- after diminish;
- after warp;
- after audio analysis;
- after dots;
- after waveform;
- after swap;
- after title-feedback injection;
- after palette conversion.

2.6. Dump RNG call index, state, modulus, result, and call-site ID.

2.7. Run both active x86 assembly warp and clean C fallback in diagnostic mode and record their delta.

2.8. Store compiler version, flags, architecture, CRT, OS, and executable hash in every fixture manifest.

2.9. Run the oracle in CI only on Windows x86. Checked-in fixtures remain the normal cross-platform source of truth.

### Verification

- The oracle produces byte-identical output on two repeated runs.
- Seed 1 reproduces the canonical MSVC RNG sequence.
- A no-op instrumentation build and a dump-enabled build produce identical final buffers.
- Assembly-vs-C differences are explicitly captured.

### Exit gate

Bergium has a deterministic native authority rather than relying only on source reading or screenshots.

---

## Phase 3 — Define the fixture format and corpus

### Goal

Make parity cheap to test at every commit.

### Steps

3.1. Define a fixture manifest:

```json
{
  "fixtureVersion": 1,
  "sourceRevision": "fcc6d57...",
  "compiler": "...",
  "profile": "geiss-4.30-plugin-8bit-x86-exact",
  "seed": 42,
  "width": 320,
  "height": 240,
  "fpsSequence": [30],
  "audioFixture": "stereo-impulse-44100",
  "modePolicy": "forced:14",
  "frames": 600
}
```

3.2. Use three storage levels:

- raw stage buffers for 32×24 and 64×48 diagnostic cases;
- compressed stage buffers for selected 320×240 frames;
- SHA-256 digests plus state traces for long runs.

3.3. Add a binary bundle reader shared by Vitest and Playwright.

3.4. Add fixture regeneration as an explicit command requiring a clean tree.

3.5. Prevent accidental fixture updates in normal tests.

3.6. Add a fixture diff tool that reports:

- first differing byte;
- bounding rectangle;
- per-value histogram;
- differing state field;
- RNG divergence point;
- optional PNG visualization.

### Initial corpus

#### Seeds

`0`, `1`, `2`, `7`, `42`, `0x12345678`, `0xffffffff`.

#### Resolutions

- 64×48 diagnostic;
- 320×240;
- 400×300;
- 512×384;
- 640×480;
- 800×600;
- 1280×960;
- one >1280×960 weight-sum case.

#### FPS

- fixed 30;
- fixed 40;
- fixed 60;
- source-valid 10 and 119 boundaries;
- deterministic jitter around 30;
- display refresh 60/120/144 while simulation stays fixed.

#### Audio

- silence;
- DC;
- one-sample impulse;
- left-only/right-only impulses;
- 20 Hz, 440 Hz, 1 kHz, and 10 kHz sine;
- phase-inverted stereo;
- white noise with fixed seed;
- periodic beat train;
- quiet-to-loud transition;
- exact captured Winamp frames;
- recorded music excerpt with redistribution-safe license.

#### Modes

- each mode 1–25 forced;
- random selection with default preferences;
- every effect forced alone;
- every valid overlapping effect pair;
- exact random effect selection.

#### Titles

- no title;
- narrow ASCII;
- very wide title;
- edge-fitting title;
- repeated title events;
- title during palette transition and big beat.

### Verification

- Fixture reader round-trips all bundles.
- One intentionally corrupted byte generates a useful localized report.
- Long-run digests identify the first divergent frame by bisection.

### Exit gate

Every subsequent change can be judged by exact data rather than eyesight.

---

## Phase 4 — Implement explicit C numeric semantics

### Goal

Stop relying on accidental JavaScript coercions.

### Steps

4.1. Add `GeissNumeric.ts` with named operations:

```ts
cTruncF32ToI32(x)
castU8(x)
castI8(x)
castI16(x)
addU8Wrap(a, b)
addU8Saturating(a, b)
mulF32(a, b)
f32(x)
```

4.2. Apply `Math.fround` at source float assignment boundaries, not indiscriminately.

4.3. Create a `GeissMath32` interface:

```ts
interface GeissMath32 {
  sin(x: number): number;
  cos(x: number): number;
  sqrt(x: number): number;
  pow(x: number, y: number): number;
  hypot2(x: number, y: number): number;
}
```

4.4. Implement the initial `js-fround-v1` profile.

4.5. Compare all map parameters, positions, and quantized bytes against native fixtures.

4.6. Where JS/libm differs at a byte boundary, test these options in order:

1. corrected source-assignment `fround` placement;
2. deterministic float32 polynomial/libm;
3. compact Wasm math module;
4. whole source-shaped Wasm kernel for only the mismatching calculation.

4.7. Version the selected math profile. Never silently change it.

4.8. Add boundary tests for:

- positive and negative truncation;
- NaN/infinity rejection;
- unsigned-char wrap;
- signed 16-bit overflow in spectrum conversion;
- exact `>` versus `>=` source comparisons.

### Verification

- Numeric primitives match a native-generated table.
- Map quantization matches native fixtures for all corpus points.
- Any remaining libm mismatch is documented by profile and cannot affect the default exact fixtures.

### Exit gate

All numeric conversions are deliberate and test-covered.

---

## Phase 5 — Centralize state and the global RNG timeline

### Goal

Make impossible any accidental independent RNG stream or hidden wall-clock dependency.

### Steps

5.1. Create `GeissClassicState` containing every reachable global relevant to output:

- frame counters and FPS;
- current and pending modes;
- effect array including unnamed slot 9;
- waveform/vis mode;
- palette arrays and blend counters;
- map parameters, positions, and buffers;
- audio histories and beat state;
- chaser history;
- solar state;
- micro-particle arrays;
- title state;
- feedback buffers;
- `slider1`;
- all option values.

5.2. Create `GeissRandomTimeline`:

```ts
interface GeissRandomCheckpoint {
  state: number;
  calls: number;
}

class GeissRandomTimeline {
  nextRaw(site: GeissRandomSite): number;
  nextModulo(modulus: number, site: GeissRandomSite): number;
  checkpoint(): GeissRandomCheckpoint;
}
```

5.3. Use a generated enum for every random call site.

5.4. Forbid `Math.random()` in `src/pipelines/geiss/classic` with ESLint/Biome.

5.5. Forbid new `MsvcRandom` construction outside initialization and tests.

5.6. Add per-stage RNG checkpoints.

5.7. Add a debug RNG ledger that can be enabled without changing sequence.

### Verification

- Native and TypeScript call-site ledgers agree.
- Every stage ends with the same RNG state and count.
- Static checks reject rogue randomness.

### Exit gate

A later visual mismatch can be classified immediately as pre-RNG, RNG, state, or rendering drift.

---

## Phase 6 — Reproduce exact initialization

### Goal

Start from the same state before frame 1.

### Steps

6.1. Replace the gradient seed with zero-filled VS1 and VS2.

6.2. Reproduce initialization statement order:

- seed;
- `chaser_offset`;
- scatter table;
- chaser coordinates and history;
- sqrt lookup;
- ten `micro_*` particle parameter sets;
- six `gF` color frequencies;
- 2,345-entry mode-7 random array;
- palette defaults;
- audio averages/history;
- mode/effect defaults;
- title and map state.

6.3. Preserve initialized-but-unused or partially used fields where they consume RNG.

6.4. Implement source defaults as data, not scattered constants.

6.5. Add an initialization snapshot serializer.

### Verification

- Full state snapshot and RNG checkpoint equal the native oracle after initialization.
- VS1/VS2 are zero.
- Every initialized array has exact values or declared float tolerance before quantization.

### Exit gate

Frame 1 begins from native-equivalent state.

---

## Phase 7 — Port mode selection, effect selection, and timing

### Goal

Make modes evolve exactly rather than cycling 1–9 by wall-clock time.

### Steps

7.1. Port the complete 25-mode preference logic.

7.2. Preserve special mode-5/mode-7 random overrides.

7.3. Port waveform selection with all rejection rules.

7.4. Port the full nine-slot effect threshold table.

7.5. Preserve:

- unnamed ninth slot;
- sound-active threshold scaling;
- forced thresholds ≥1000;
- minimum effect enforcement only under source conditions;
- random disabling above maximum count;
- Chaser variant selection;
- Grid disabling Bar;
- Nuclide disabling waveform under source conditions;
- mode-10 spectrum selection;
- mode-15 waveform special case;
- spectral slot behavior without enabling dead experimental rendering.

7.6. Port FPS-scaled mode duration.

7.7. Split simulation clock from render clock.

7.8. Implement deterministic fixed-step catch-up with a maximum backlog policy outside classic state.

7.9. Add manual forced-mode test controls that do not consume production RNG.

### Verification

- Mode/effect/waveform state traces match native fixtures for at least 10,000 frames.
- Rendering at 60, 120, and 144 Hz with a 30 Hz simulation gives identical state traces.
- Forced-mode debug controls leave the normal path unchanged.

### Exit gate

Mode selection is complete and deterministic across all 25 modes.

---

## Phase 8 — Port all map parameter families

### Goal

Match the source before optimizing map generation.

### Steps

8.1. Split current `MapParameterFactory` into source-order initialization and per-pixel mapping.

8.2. Port modes 1–25 literally.

8.3. Preserve anomalies:

- mode 6 initializes ten influence fields but evaluates five;
- dead second mode-16 branch stays unreachable;
- mode 7 consumes the preinitialized cyclic random array;
- mode 14 consumes global RNG per pixel;
- mode 5 behavior depends on Nuclide selection;
- mode 12 alters weight sum;
- checkerboard parameter paths;
- protective scaling at high resolution.

8.4. Replace `floor` with C truncation in exact profiles.

8.5. Preserve X wrapping by `W-1`.

8.6. Preserve flattened source-index clamping to safe rows.

8.7. Preserve independent byte casts of all four weights, including wrapping.

8.8. Store source-relative delta and absolute base offset in diagnostic output.

8.9. Keep current safe/convex map behavior only under GPU-fast.

### Verification

For every mode and resolution:

- initial parameters;
- first, center, edge, negative-coordinate, and last map texels;
- full 64×48 map;
- RNG checkpoint after each chunk;
- full-map digest

must equal native output.

### Exit gate

All 25 map families and source quirks are frozen.

---

## Phase 9 — Reproduce chunked map generation and activation

### Goal

Preserve temporal map construction and RNG interleaving.

### Steps

9.1. Port `y_map_pos`, `frames_crunching_this_mode`, and exact `end_pos` calculation.

9.2. Generate only the source-defined chunk each simulation frame.

9.3. Continue normal effects/audio/title RNG between chunks.

9.4. Implement rush-map behavior.

9.5. Port pending-map readiness.

9.6. Port immediate activation for rush/non-beat modes.

9.7. Port big-beat-gated activation and declining threshold.

9.8. Snapshot active/pending maps explicitly.

9.9. Add a Worker experiment only after single-thread parity:

- central timeline reserves exact random outputs for the chunk;
- Worker receives immutable parameters and reserved random values;
- completion timing cannot alter activation timing;
- a delayed Worker must yield the same activation frame.

### Verification

- Per-frame `y_map_pos`, RNG state, pending digest, and activation frame match native.
- Artificial Worker delays produce identical state.
- Mode 14 remains exact.

### Exit gate

Map generation is temporally faithful and safely parallelizable later.

---

## Phase 10 — Implement the exact 8-bit warp

### Goal

Reproduce the active x86 path, not merely its intended bilinear formula.

### Steps

10.1. Add `GeissWarp8PortableOracle` for the clean C fallback.

10.2. Add `GeissWarp8X86Oracle` for active assembly semantics.

10.3. Port active-row bounds exactly.

10.4. Apply `slider1` to the source start pointer.

10.5. Process destination pixels in two-pixel groups.

10.6. For each pair:

- initialize the first accumulator low byte from the first relative map delta;
- add four products;
- emit the high byte;
- clear only the high byte;
- retain the low remainder;
- add the second pixel’s products;
- emit the high byte.

10.7. Reproduce odd active-pixel-count behavior if reachable.

10.8. Define and fixture all source pointer safety margins.

10.9. Compare the x86 and portable profiles and document their visual/statistical difference.

10.10. Keep the existing independent-per-pixel shader only in GPU-fast until an exact packed-pair GPU representation is proven.

### Verification

- Exact equality for random frames/maps at every target resolution.
- Adversarial tests maximize products, deltas, low-byte carry, and slider shifts.
- 10,000-frame native replay remains exact after warp integration.

### Exit gate

The central feedback transform is native-byte-equivalent.

---

## Phase 11 — Define exact Winamp-frame input

### Goal

Separate classic simulation fidelity from browser capture fidelity.

### Steps

11.1. Define:

```ts
interface WinampVisualizationFrame {
  waveformLeft: Uint8Array;   // exactly 576
  waveformRight: Uint8Array;
  spectrumLeft: Uint8Array;
  spectrumRight: Uint8Array;
  playbackState: "playing" | "paused" | "stopped";
  title?: string;
}
```

11.2. Validate exact lengths and immutable ownership.

11.3. Port active `GetWaveData()` from `main.cpp`, not older `SOUND.CPP`.

11.4. Preserve:

- Winamp level-trigger scan;
- XOR/signed-byte conversion;
- interleaving;
- `.8/.2` two-sample smoothing;
- sparse DC removal;
- buffer-size rule;
- waveform and spectrum branches;
- `__int16` conversion and overflow;
- spectrum decay;
- 24-band Fourier path where active;
- suggested damping calculation followed by source reset.

11.5. Expose post-GetWaveData arrays in fixtures.

### Verification

- `g_SoundBuffer`, `g_fSoundBuffer`, Fourier arrays, and RNG checkpoint match native for every synthetic host frame.
- Left/right channel asymmetry is tested explicitly.
- Current production mono averaging is removed from exact profiles.

### Exit gate

Given identical Winamp buffers, browser and native classic state are identical.

---

## Phase 12 — Build and calibrate the browser PCM host adapter

### Goal

Make live browser audio as close as possible without overstating certainty.

### Steps

12.1. Capture PCM in an `AudioWorklet`; no allocations or FFT in `process()`.

12.2. Transport timestamped stereo PCM via ringbuf.js.

12.3. Resample to a 44.1 kHz reference clock with a versioned deterministic resampler.

12.4. Reconstruct 576-byte waveform channels with explicit window alignment and quantization.

12.5. Create `tools/winamp-host-probe`, a minimal visualization plugin that logs incoming Winamp arrays.

12.6. Pin one Winamp build and OS image.

12.7. Play lossless known-sample WAV fixtures and capture:

- host waveform arrays;
- host spectrum arrays;
- timestamps/cadence;
- startup and seek behavior;
- pause/resume behavior.

12.8. Fit and verify the browser spectrum pipeline:

- window function;
- FFT size;
- magnitude/log scaling;
- bin mapping;
- decay/smoothing;
- clipping and byte conversion.

12.9. Version adapters, for example:

- `winamp-5.x-captured-v1`;
- `browser-winamp-v1`;
- `analysernode-legacy-v1`.

12.10. Retain AnalyserNode only as a compatibility fallback, never exact default.

### Verification

- Waveform adapter byte agreement is measured over the entire probe corpus.
- Spectrum adapter reports exact-match percentage, mean absolute byte error, p95 error, and first differing bin.
- The UI/debug report displays the active host-audio profile.

### Exit gate

Live audio is calibrated and honestly labeled; direct Winamp-frame replay remains the exact authority.

---

## Phase 13 — Port pre-warp effects one effect per commit

### General rule

Each effect commit must include:

1. source-shaped readable implementation;
2. state fixture;
3. buffer fixture before and after the effect;
4. RNG call-site fixture;
5. overlap/adversarial tests;
6. optimized typed-array implementation with exact equality.

### 13A — ShadeBobs

- initialize and use ten `micro_*` records;
- use `floatframe`;
- apply four sequential random jitters;
- preserve bounds;
- preserve `<250` conditional increments and byte behavior;
- implement 8-bit first, 32-bit later.

**Adversarial pixels:** 248, 249, 250, 251, 254, 255.

### 13B — Two Chasers

- FPS-correct `t`;
- exact sample count `int(20*s)`;
- exact one/two passes;
- source cosine constants;
- nonlinear brightening;
- source clipping.

**Adversarial pixels:** 0, 1, 127, 254, 255; both variants.

### 13C — Solid Bar

- exact path, sample count, and motion;
- exact conditional increments;
- source width-dependent behavior;
- overlap order.

### 13D — Dot Chaser

- persistent 20-entry history;
- exact ring pointer;
- direct assignment;
- width thresholds for fat pixels;
- per-frame X drift;
- exact color state even in 8-bit.

### 13E — Pre-warp Nuclide

- exact random node/radius/phase selection;
- exact volume-independent source branch used by `RenderFX`;
- saturating addition;
- sqrt/radius boundaries;
- exact color calculations retained for 32-bit state.

### 13F — Grid

- `FXW/30` spacing;
- source three-oscillator brightness;
- FPS correction;
- moving direction;
- exact skinny/fat thresholds;
- maximum writes.

### 13G — Solar particles

- both 320-wide and general algorithms;
- exact particle count formulas;
- exact source/random sequence;
- center and neighboring write semantics;
- preserve any unsigned-byte overflow;
- exact bounds and width-dependent fatness.

### 13H — Diminish Center

- mode-12 vertical-line behavior;
- repeated center/neighbor updates;
- exact `>1` checks;
- exact float multiply and byte cast;
- `center_dwindle` per mode.

### Verification

- Every individual effect matches native stage bytes.
- The full source-order effect chain matches native even with heavy overlap.
- RNG checkpoints agree after each effect.
- Removing or reordering any effect causes a deliberate test failure.

### Exit gate

The entire pre-warp frame is exact.

---

## Phase 14 — Port RenderDots and post-warp Nuclide

### Goal

Reproduce audio-state evolution and post-warp drawing.

### Steps

14.1. Port volume min/max scan.

14.2. Preserve 120-frame history indexing.

14.3. Preserve narrow/normal/wide FPS-adjusted averages.

14.4. Preserve the source peak-count behavior, including inactive/commented logic resulting in zero where applicable.

14.5. Port beat-strength calculation and 109/71 hysteresis.

14.6. Preserve physical-slot 0–39 `max_vol` quirk.

14.7. Port big-beat threshold.

14.8. Port brightness and base waveform color calculations.

14.9. Port `g_hit` title trigger lifecycle.

14.10. Port post-warp audio-triggered Nuclide exactly.

14.11. Port slide-shift state and random calls.

14.12. Apply post-warp mutations to VS2 before waveform drawing.

### Verification

- All scalar audio state fields match native every frame.
- Post-warp buffer matches before waveform.
- Big-beat/map-activation frame matches.
- Title and slider RNG remain aligned.

### Exit gate

Audio reactivity and post-warp particles are source-equivalent.

---

## Phase 15 — Port all six reachable waveforms and spectrum presentation

### Goal

Restore the actual curve family, including dual stereo/spectrum traces.

### Steps

15.1. Move waveform drawing out of the adapter.

15.2. Use interleaved left/right `g_fSoundBuffer`.

15.3. Port high-resolution interpolation in-place and in source order.

15.4. Implement:

1. horizontal trace;
2. two horizontal stereo traces;
3. vertical trace;
4. two diagonal stereo traces;
5. radial trace;
6. rotated stereo XY.

15.5. Preserve mode-10 center/start/end changes.

15.6. Preserve exact strict/non-strict bounds per branch.

15.7. Preserve `.9/.1` and `.5/.5` recurrences.

15.8. Preserve waveform-5 in-place preblend.

15.9. Preserve waveform-6 frame-dependent rotation.

15.10. Keep waveform 7 unreachable.

15.11. Make geometry writers allocation-free:

```ts
writeWaveform(state, frame, target: Uint8Array): void
```

15.12. Do not build arrays of `[x, y]` tuples in the fast path.

### Verification

- Each waveform stage buffer matches native.
- Waveforms 2 and 4 prove both channels independently.
- Mode 10 waveform and spectrum variants match.
- High-resolution interpolation fixtures cover every pass threshold.

### Exit gate

The original waveform/spectrum visual family is restored.

---

## Phase 16 — Fix palette generation, blending, and WebGL presentation

### Goal

Reproduce palette state exactly while keeping RGB outside feedback.

### Steps

16.1. Port special palettes with explicit source channel names:

```ts
{ red: REMAP, blue: REMAP2, green: REMAP3 }
```

16.2. Port all seven curve functions with float32 semantics.

16.3. Preserve coarse-band amplification.

16.4. Preserve gamma and sound-empty behavior.

16.5. Preserve random-call order and dark-curve rejection.

16.6. Preserve old/new/current palette arrays.

16.7. Preserve the reachable blend-counter decrement order.

16.8. Add exact 256-entry palette fixtures.

16.9. Implement `GeissWebGLPresenter`:

- visible canvas owns WebGL2;
- one scalar `R8` texture, RGBA8 fallback;
- `UNPACK_ALIGNMENT = 1`;
- `texSubImage2D` from current feedback frame;
- 256×1 palette LUT;
- nearest scalar sampling by default;
- explicit display scaling policy;
- no `readPixels`;
- no Canvas2D staging.

16.10. Add optional display-only smooth scaling under a non-exact presentation flag. It must not affect feedback.

### Verification

- Palette bytes equal native.
- Presented RGB equals palette lookup for every intensity.
- Feedback digest is invariant under output resolution and scaling policy.
- Production frame path performs zero GPU readbacks.

### Exit gate

Color and presentation are correct and fast.

---

## Phase 17 — Reproduce title lifecycle and dual destination

### Goal

Restore the source behavior without conflating feedback text and overlay text.

### Steps

17.1. Port title-event and `g_hit` state.

17.2. Port random placement using four summed samples per axis.

17.3. Port source bounds and text extent use.

17.4. Define `GeissTitleRasterizer`:

```ts
interface GeissTitleRasterizer {
  measure(text: string): { width: number; height: number };
  rasterize(text: string): Uint8Array;
  profileId: string;
}
```

17.5. Add a native GDI rasterizer to the oracle.

17.6. Add a deterministic browser rasterizer using a pinned open font and fixed bitmap/antialiasing rules.

17.7. Reproduce phase-0 feedback injection:

- threshold mask >1;
- write intensity 225;
- same bounding loops and clipping.

17.8. Reproduce overlay:

- dark 20-valued shadow at +1,+1;
- 225 foreground;
- opaque/transparent phase behavior;
- no generic alpha fade.

17.9. Keep modern title animation as a separate extension profile.

### Verification

- RNG, position, dimensions, lifecycle, and feedback mask match the declared native/browser text profile.
- Title feedback visibly warps on subsequent frames.
- Overlay remains outside feedback.
- Disabling titles consumes no title RNG.

### Exit gate

Title behavior is structurally faithful and host differences are explicit.

---

## Phase 18 — Integrate the classic engine into Bergium

### Goal

Replace the simplified adapter without breaking the public API.

### Steps

18.1. Make `GeissAdapter` a thin API adapter only.

18.2. Instantiate:

- one capture adapter;
- one `GeissClassicEngine`;
- one exact or fast backend;
- one WebGL presenter.

18.3. Remove `audioStep()` and all manual waveform/effect drawing.

18.4. Remove nine-mode constant and wall-clock mode cycle.

18.5. Remove gradient seeding.

18.6. Remove per-mode recreation of the 2,345-entry random array.

18.7. Remove `readPixelsToCanvas()`.

18.8. Remove per-frame `Uint8Array`, `ImageData`, temporary canvas, and tuple allocations.

18.9. Wire `setMode()` through a debug/manual policy that is explicit about RNG effects.

18.10. Preserve Webamp-facing methods.

18.11. Make resize distinguish:

- exact internal simulation resolution;
- display canvas resolution.

18.12. Add profile and seed options to public configuration.

### Verification

- MilkDrop pipeline fixtures remain unchanged.
- Webamp contract tests pass.
- Exact Geiss fixtures pass through the public adapter.
- Canvas resize does not change simulation output unless internal resolution changes.
- Context loss/restore reproduces state from a serialized checkpoint.

### Exit gate

The production application runs the source-derived engine, not the prototype.

---

## Phase 19 — Optimize the exact typed-array backend

### Goal

Meet performance goals without semantic drift.

### Initial strategy

Do not use runtime code generation first. Use code shaped for browser JITs:

- typed arrays;
- stable object shapes;
- integer loop indices;
- `Math.imul` where required;
- hoisted dimensions/constants;
- no polymorphic helper calls in hot loops;
- no closures or iterators in frame loops;
- no temporary object/tuple creation;
- reusable scratch arrays;
- branch specialization outside pixel loops.

### Steps

19.1. Benchmark the readable oracle and exact backend separately.

19.2. Use packed map arrays:

```ts
baseOffset: Int32Array
weights: Uint32Array
relativeDelta: Int32Array
```

19.3. Specialize 8-bit and 32-bit paths into separate modules.

19.4. Specialize each effect by display depth.

19.5. Inline numeric primitives only after parity coverage.

19.6. Generate monomorphic mode kernels at build time only where profiling proves map arithmetic hot.

19.7. Move exact simulation to a dedicated Worker where supported:

- Worker owns all classic state and RNG;
- AudioWorklet ring feeds Worker;
- Worker returns or directly uploads the finished frame through OffscreenCanvas;
- main-thread fallback uses identical engine code.

19.8. Use triple-buffered transferable/SAB frames when OffscreenCanvas is unavailable.

19.9. Evaluate Wasm only against measured bottlenecks:

- exact warp;
- map generation;
- bulk effect loops;
- float32/libm compatibility.

19.10. Keep a differential test running reference and optimized backends for every fixture.

### Provisional local microbenchmark

A simple packed four-tap JavaScript loop on Node 22 measured approximately:

| Internal resolution | Synthetic warp time |
|---|---:|
| 320×240 | 0.32 ms/frame |
| 640×480 | 1.19 ms/frame |
| 1280×960 | 4.24 ms/frame |
| 1920×1080 | 7.25 ms/frame |
| 3840×2160 | 29.43 ms/frame |

These are not end-to-end browser guarantees, but they show that a source-like internal resolution is inexpensive. Exact simulation should normally run at the declared Geiss internal resolution and be scaled by WebGL to 4K/8K output.

### Performance gates

After warm-up:

- zero allocations per steady-state simulation frame;
- zero GPU readbacks in production;
- one scalar texture upload per presented frame;
- stable 30 Hz simulation at 640×480 on baseline hardware;
- p95 simulation target ≤4 ms at 640×480;
- p95 simulation target ≤10 ms at 1280×960;
- display at 60/120/144 Hz does not accelerate simulation;
- no long task from map generation.

### Exit gate

`classic-fast` equals `classic-reference` exactly and meets the declared budgets.

---

## Phase 20 — Re-promote proven work to WebGL selectively

### Goal

Use the GPU where it improves performance without changing classic output.

### Rules

1. A GPU pass starts as experimental.
2. It must compare against exact CPU stage bytes.
3. No tolerance is allowed for scalar intermediate buffers.
4. Cross-GPU equality must be tested.
5. A pass that cannot be exact remains GPU-fast only.

### Candidate order

20.1. Palette LUT presentation — already naturally exact.

20.2. Final scaling/composition — output-only.

20.3. Grid max writes — potentially exact with integer textures.

20.4. Waveform max writes — possible if rasterization is replaced by exact explicit pixel events, not GL line rules.

20.5. Saturating Nuclide — dedicated integer read/modify/write pass.

20.6. Other effects, one by one.

20.7. Warp experiment:

- pack two destination pixels into one logical GPU invocation;
- reproduce x86 pair accumulator;
- prove active-row and slider semantics;
- retain CPU default unless all devices pass.

### Explicitly prohibited shortcuts

- hardware linear filtering for exact warp;
- floating normalized blending where byte rounding matters;
- shader hash randomness;
- independent GPU RNG;
- GL points/lines whose coverage rules differ from source pixel loops;
- colorized feedback in the 8-bit profile.

### Exit gate

Any GPU-exact pass is a drop-in backend replacement with zero fixture delta.

---

## Phase 21 — Implement 32-bit true-color as a separate dynamical profile

### Goal

Avoid treating true-color as palette output.

### Steps

21.1. Freeze the complete 8-bit profile first.

21.2. Define BGRx feedback buffers and byte layout.

21.3. Port 32-bit map sampling and assembly/portable semantics.

21.4. Port per-channel effects in source order.

21.5. Port waveform color calculation.

21.6. Port title colors and feedback injection.

21.7. Port mode/effect threshold changes for true-color.

21.8. Add independent native fixtures for every stage.

21.9. Add WebGL BGR/RGBA translation only at presentation boundaries.

### Verification

- No 8-bit fixture changes.
- Full 32-bit stage buffers match native.
- 32-bit output is not implemented by applying a palette to 8-bit state.

### Exit gate

Bergium supports both original dynamical systems honestly.

---

## Phase 22 — CI, fuzzing, release, and documentation

### CI matrix

#### Fast on every change

- numeric unit tests;
- RNG sequence and ledger;
- state-machine tests;
- 64×48 raw stage fixtures;
- backend differential tests;
- lint preventing rogue randomness/allocations.

#### Full on pull requests

- 320×240 and 640×480 fixture corpus;
- 10,000-frame replay digests;
- Playwright Chromium, Firefox, WebKit;
- worker/main-thread equivalence;
- WebGL presentation tests;
- memory/performance smoke tests.

#### Scheduled/nightly

- all modes/resolutions/audio fixtures;
- GPU-vendor matrix where available;
- fuzzed seeds and option combinations;
- Windows native-oracle verification;
- 100,000-frame stability replay.

### Fuzzing

22.1. Generate random but valid profile configurations.

22.2. Differentially run reference and fast backends.

22.3. Bias values toward:

- map boundaries;
- byte overflow;
- threshold values;
- odd dimensions;
- minimum active rows;
- mode transitions;
- title clipping;
- slider extremes.

22.4. Minimize failing seeds into permanent regression fixtures.

### Release rules

A release may claim `geiss-4.30-plugin-8bit-x86-exact` only when:

- all 25 modes are implemented;
- all active 8-bit effects are implemented;
- source-order frame stages match native;
- RNG checkpoints match;
- map chunks and activation match;
- x86 warp matches;
- all six waveforms match;
- palette state matches;
- title lifecycle matches its declared host-text profile;
- direct Winamp-frame replay matches;
- no production GPU readback exists;
- performance gates pass;
- host-defined audio/text/math differences are visible in metadata and docs.

---

# 7. Verification pyramid

## Level 1 — Scalar and conversion tests

Test individual operations:

- MSVC RNG;
- signed-byte conversion;
- float-to-int truncation;
- unsigned-byte wrapping;
- saturating addition;
- threshold comparisons;
- weight casts;
- palette curve outputs;
- FPS-rate correction.

**Tolerance:** none for integers/bytes; explicitly declared for pre-quantized floats.

## Level 2 — State-transition tests

Assert:

- mode/effect arrays;
- frame counters;
- palette counters;
- map progress;
- beat and volume state;
- title state;
- slider state;
- RNG checkpoint.

**Tolerance:** none except named float fields before their next quantization boundary.

## Level 3 — Per-function buffer tests

For each effect and renderer:

```text
input buffer + state + RNG
           ↓
       one function
           ↓
output buffer + state + RNG
```

**Tolerance:** zero bytes.

## Level 4 — Per-stage frame tests

Capture every normative frame boundary.

**Tolerance:** zero bytes.

## Level 5 — Long replay tests

Store per-frame hashes and state digests for 10,000+ frames.

**Tolerance:** zero digest differences.

## Level 6 — Native differential tests

Run native and Bergium against identical fixtures and identify first divergence.

**Tolerance:** zero for source-controlled buffers/state.

## Level 7 — Browser/GPU presentation tests

- scalar upload;
- LUT result;
- output orientation;
- scaling;
- compositor;
- title overlay.

**Tolerance:** zero for offscreen integer targets; narrowly declared for final browser color/text raster output.

## Level 8 — Human visual review

Side-by-side and flicker comparisons remain useful for detecting fixture blind spots, but cannot approve a mismatch.

---

# 8. Required diagnostic tooling

## 8.1 State inspector

Expose a paused frame with:

- complete profile identity;
- RNG state/count/last call sites;
- mode/effects/waveform;
- active and pending map state;
- audio averages/beat;
- palette state;
- title state;
- buffer digests.

## 8.2 Stage viewer

Display:

- VS1 before effects;
- after each effect;
- after diminish;
- post-warp;
- post-dots;
- post-wave;
- title feedback;
- final palette output;
- absolute diff and heatmap against fixture.

## 8.3 Replay recorder

Record:

- exact host input frames;
- timing sequence;
- title events;
- resize/profile events;
- seed/options.

Playback must not require live audio.

## 8.4 RNG divergence reporter

On mismatch, print:

```text
expected call 48192: MAP_MODE14_PIXEL rand()%1024 -> 731
actual   call 48192: SHADE_JITTER_X    rand()%5    -> 1
previous matching checkpoint: frame 183, after Grid
```

## 8.5 Performance inspector

Measure separately:

- audio adaptation;
- map chunk;
- effects;
- warp;
- dots/wave;
- texture upload;
- present;
- allocations;
- worker latency.

---

# 9. Risk register

| Risk | Consequence | Mitigation |
|---|---|---|
| x86 assembly accumulator semantics misunderstood | persistent feedback drift | native stage fixture; two-pixel adversarial kernels |
| historical/current MSVC libm difference | map bytes differ at boundaries | math characterization phase; versioned deterministic math/Wasm |
| Winamp spectrum algorithm is host-defined | live spectrum differs | host probe, pinned Winamp corpus, honest adapter profile |
| GDI null-face font mapping varies | title pixels differ | exact lifecycle plus pinned open browser font; native GDI fixtures |
| source out-of-range or overflow behavior | JS silently normalizes it | explicit typed storage, safety padding, native adversarial fixtures |
| GPU normalized formats round differently | byte drift | integer/readable CPU default; exact GPU stage comparison |
| map Worker reorders RNG | all later visuals diverge | one RNG owner; reserved random blocks or full simulation Worker |
| display refresh changes simulation | mode/audio drift | fixed simulation scheduler |
| high display resolution drives exact simulation too large | performance collapse | separate internal simulation and display resolution |
| fixture regeneration hides regressions | false confidence | explicit Windows-only regeneration and reviewed manifests |
| dead/commented code accidentally enabled | non-original visuals | reachable-source index and profile tests |
| “improvements” erase source quirks | visual drift | exact and modernized profiles remain separate |

---

# 10. Atomic commit sequence

A practical small-commit sequence:

1. `docs(geiss): define exact fidelity profiles`
2. `test(geiss): freeze legacy prototype baseline`
3. `feat(geiss): add backend selection`
4. `build(oracle): add x86 native fixture harness`
5. `test(oracle): pin msvc rng and clock`
6. `feat(oracle): dump stage buffers`
7. `feat(oracle): log rng call sites`
8. `test(fixtures): add bundle reader and diff tool`
9. `feat(geiss): add explicit numeric semantics`
10. `test(geiss): pin c casts and overflow`
11. `feat(geiss): centralize classic state`
12. `feat(geiss): centralize random timeline`
13. `test(geiss): add rng ledger fixtures`
14. `feat(geiss): reproduce zero-state initialization`
15. `test(geiss): pin initialization snapshot`
16. `feat(geiss): port 25-mode selection`
17. `feat(geiss): port effect selection`
18. `feat(geiss): split simulation and presentation clocks`
19. `test(geiss): add 10k-frame mode trace`
20. `fix(geiss): use c truncation in exact maps`
21. `fix(geiss): preserve byte-wrapped map weights`
22. `feat(geiss): port map modes 1-5`
23. `feat(geiss): port map mode 6`
24. `feat(geiss): port map modes 7-12`
25. `feat(geiss): port map modes 13-16`
26. `feat(geiss): port map modes 17-25`
27. `feat(geiss): restore chunked map generation`
28. `feat(geiss): restore map activation timing`
29. `test(geiss): pin mode-14 rng interleaving`
30. `feat(geiss): add portable 8-bit warp oracle`
31. `feat(geiss): add x86 pair-carry warp`
32. `test(geiss): pin slider and carry behavior`
33. `feat(geiss): define winamp visualization frame`
34. `feat(geiss): port active GetWaveData`
35. `test(geiss): pin waveform and spectrum buffers`
36. `feat(audio): add deterministic worklet adapter`
37. `tool(audio): add winamp host probe`
38. `feat(geiss): port ShadeBobs`
39. `feat(geiss): port Two Chasers`
40. `feat(geiss): port Solid Bar`
41. `feat(geiss): port Dot Chaser`
42. `feat(geiss): port pre-warp Nuclide`
43. `feat(geiss): port Grid`
44. `feat(geiss): port Solar particles`
45. `feat(geiss): port Diminish Center`
46. `test(geiss): pin full pre-warp chain`
47. `feat(geiss): port volume and beat state`
48. `feat(geiss): port post-warp Nuclide`
49. `feat(geiss): port slide shift`
50. `feat(geiss): port waveform 1`
51. `feat(geiss): port waveform 2`
52. `feat(geiss): port waveform 3`
53. `feat(geiss): port waveform 4`
54. `feat(geiss): port waveform 5`
55. `feat(geiss): port waveform 6`
56. `test(geiss): pin high-resolution interpolation`
57. `fix(geiss): restore special palette channel order`
58. `feat(geiss): port palette lifecycle`
59. `feat(webgl): add direct scalar palette presenter`
60. `perf(webgl): remove production readback`
61. `feat(geiss): port title state and placement`
62. `feat(geiss): add feedback title mask`
63. `feat(webgl): add source-style title overlay`
64. `refactor(geiss): replace prototype adapter path`
65. `perf(geiss): remove steady-state allocations`
66. `perf(geiss): add packed map backend`
67. `test(geiss): differential reference and fast backends`
68. `perf(geiss): move classic simulation to worker`
69. `test(geiss): add cross-browser replay matrix`
70. `docs(geiss): publish fidelity and host-deviation report`
71. `feat(geiss): begin separate 32-bit profile`

Every commit should leave the tree green and add no unverified behavior to the exact backend.

---

# 11. Definition of done

The 8-bit implementation is complete only when all statements below are true:

- [ ] The pinned native x86 oracle is reproducible.
- [ ] One global RNG timeline matches at every checkpoint.
- [ ] Initialization matches.
- [ ] All 25 modes and all reachable selection rules match.
- [ ] Pending-map chunk size, RNG interleaving, and activation match.
- [ ] All map bytes match, including negative-coordinate quirks.
- [ ] The active x86 pairwise warp matches.
- [ ] Supplied Winamp waveform/spectrum frames produce matching audio state.
- [ ] Every active 8-bit pre-warp effect matches independently and in combination.
- [ ] RenderDots, beat detection, title triggers, and slider state match.
- [ ] All six reachable waveforms match.
- [ ] Palette generation and lifecycle match.
- [ ] Title lifecycle, placement, feedback injection, and overlay match the declared text profile.
- [ ] 10,000-frame replay digests match for the full corpus.
- [ ] Exact internal buffers are identical in reference and fast backends.
- [ ] Production performs no GPU readback.
- [ ] Steady-state frame processing allocates no garbage.
- [ ] Display refresh and output resolution do not change classic simulation.
- [ ] Browser PCM and text host differences are versioned and reported.
- [ ] GPU-fast and extensions cannot alter exact-profile fixtures.
- [ ] The public Webamp/Butterchurn-compatible API remains intact.
- [ ] Licensing and technical attribution are complete.

---

# 12. Immediate first milestone

The first milestone should stop after the following vertical slice:

1. Native oracle builds and dumps deterministic 64×48 8-bit frames.
2. Fixture reader/diff tool works.
3. Classic state and global RNG timeline match initialization.
4. Mode 1 map is generated in exact chunks.
5. The x86 pairwise warp matches native.
6. Silence produces exact zero/audio state.
7. Scalar result is uploaded directly to WebGL and palette-presented without readback.

This deliberately excludes particles and live audio. It proves the most difficult infrastructure—native truth, RNG ordering, map timing, x86 warp, and direct WebGL presentation—before the effect-by-effect work begins. Once this slice is green, every remaining effect becomes a small, independently verifiable port rather than another architectural gamble.
