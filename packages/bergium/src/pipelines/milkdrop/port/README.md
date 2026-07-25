# MilkDrop (Butterchurn) TypeScript port

Leaf-first, mechanical TypeScript port of the pinned Butterchurn renderer
(`vendor/butterchurn`, revision `fbac2f6…`), per `implementation_plan.md` Phase 1
("fork the pinned source and add types leaf-first") and Phase 8.

## Rules (from the plan)
- **Mechanical port:** preserve numeric coercion, statement order, per-frame /
  per-pixel equation order, audio array handling, shader strings, mipmap timing,
  texture filters, blur ratios and blend functions (see
  `docs/butterchurn-drift-guard.md`). Do NOT rewrite EEL/WASM, shaders, texture
  formats or audio constants.
- **Frozen assets:** the EEL interpreter (AssemblyScript → WASM) and the GLSL
  shader strings stay as bundled assets; this port covers the JS/TS surface.
- **Faithful dead state:** the vendored source carries several write-only fields
  (e.g. `invAspectx`/`invAspecty`, `texsizeY`, `mesh_width`/`mesh_height`) that are
  assigned in the constructor/updateGlobals but never read anywhere in that module.
  These are preserved **verbatim** (not pruned) and marked with an inline
  `// Faithful dead state …` comment, so the port remains an honest 1:1 mechanical
  mirror (statement order intact) rather than a merely behaviorally-equivalent one.
  Pruning them would change no rendered output, but would break the structural
  parity the drift guard relies on for reviewability and future reconciliation.
- **Verified, not asserted:** each ported module is checked against the vendored
  source's behavior (deterministic golden values captured from the pinned JS).
  The prebuilt `butterchurn@3.0.0-beta.5` freeze test
  (`tests/browser/butterchurn-freeze.test.ts`) remains the whole-renderer
  regression target.

## Status (leaf order)
- [x] `seededRandom.ts` — xorshift128+ `SeededRandom`, `createRNGContext`
      (from `vendor/butterchurn/src/utils/seededRandom.js`)
- [x] `Utils.ts` — math/object helpers (from `vendor/butterchurn/src/utils.js`)
- [x] `rngContext.ts` — EEL RNG globals override (from `utils/rngContext.js`)
- [x] `fft.ts` — radix-2 FFT (from `audio/fft.js`)
- [x] `audioProcessor.ts` — analyser graph + `updateAudio` (the AudioWorklet seam)
      (from `audio/audioProcessor.js`)
- [x] `audioLevels.ts` — bass/mid/treble + attack/average (from `audio/audioLevels.js`)
- [x] `presetEquationRunner.ts` — JS equation evaluator (init/frame/pixel +
      per-shape/per-wave, q/t/reg + user-var carry). `Utils` generalized for the
      dynamic equation vars. (from `equations/presetEquationRunner.js`)
- [x] `presetBase.ts` — EEL standard-function library (`sqr`/`sqrt`/`pow`/`mod`/
      `sigmoid`/`bor`/`band`/`equal`/`above`/`ifcond`/`memcpy` + `rand`/`randint`),
      installed on the host global. (from `presetBase.js`)
- [x] `blankPreset.ts` — default preset (baseVals + init/frame/pixel eqs + 4 waves
      + 4 shapes + warp/comp shaders). (from `blankPreset.js`)
- [x] `blendPattern.ts` — preset-blend interpolation field (`vertInfoA`/`vertInfoC`,
      `genPlasma`, 4 mix types, `resizeMatrixValues`). (from `rendering/blendPattern.js`)
- [x] `shaderUtils.ts` — shader string parsing + float-precision detection.
      (from `rendering/shaders/shaderUtils.js`)
- [x] `resample.ts` — fullscreen-quad texture resampler. (from `rendering/shaders/resample.js`)
- [x] `waveUtils.ts` — waveform vertex smoothing (Catmull-Rom midpoint insertion).
      (from `rendering/waves/waveUtils.js`)
- [x] `darkenCenter.ts` — center-darkening sprite (vendored mis-named `CustomShape`;
      renamed `DarkenCenter`). (from `rendering/sprites/darkenCenter.js`)
- [x] `output.ts` — final presentation pass with optional FXAA (frozen FXAA GLSL).
      (from `rendering/shaders/output.js`)
- [x] `border.ts` — inner/outer border sprite (triangle-fan geometry).
      (from `rendering/sprites/border.js`)
- [x] `motionVectors.ts` — motion-vector grid generation + draw.
      (from `rendering/motionVectors/motionVectors.js`)
- [x] `imageTextures.ts` — preset image sampler manager (built-in base64 injected
      externally per the external-asset rule). (from `image/imageTextures.js`)
- [x] `noise.ts` — 2D/3D noise texture generation + binding (cubic interpolation).
      (from `noise/noise.js`)
- [x] `blurHorizontal.ts`, `blurVertical.ts`, `blur.ts` — separable two-pass
      Gaussian blur with FBO management. (from `rendering/shaders/blur/`)
- [x] `warp.ts` — feedback warp pass with preset shader injection (5 main samplers
      + blur/noise/user-image samplers, per-vertex warp UVs/colors).
      (from `rendering/shaders/warp.js`)
- [x] `comp.ts` — composite pass with fixed 32×24 hue-shaded grid, echo/gamma/post
      effects. (from `rendering/shaders/comp.js`)
- [x] `basicWaveform.ts` — the 8 built-in (non-custom) waveform modes.
      (from `rendering/waves/basicWaveform.js`)
- [x] `customWaveform.ts` — per-point-equation custom waveforms (4 slots).
      (from `rendering/waves/customWaveform.js`)
- [x] `customShape.ts` — per-frame-equation custom shapes (4 slots) + outline border.
      (from `rendering/shapes/customShape.js`)
- [x] `titleText.ts` — song-title animation (Canvas2D-rasterized texture, wobbling
      16×8 UV grid). Browser-only. (from `rendering/text/titleText.js`)
- [ ] `presetEquationRunnerWASM.ts` — wrapper around the **frozen `eel-wasm` asset**
      (plan non-goal: do not reimplement EEL/WASM); port its types/seam in Phase 8.
- [x] `renderer.ts` (1473 lines) — top-level frame pipeline: equations, warp, blur,
      motion vectors, shapes/waves, border, title text, composite, output.
      (from `rendering/renderer.js`)
- [x] `butterchurn.ts` (460 lines) — top-level visualizer: owns canvas, audio
      processor, and renderer; implements `ButterchurnVisualizerHandle`.
      (from `visualizer.js` + `index.js`)
- [x] `index.ts` — `createButterchurnVisualizer` factory (matches vendor API).

When a module is fully ported and wired, `MilkdropPipeline` switches from the
injected prebuilt reference to the in-tree port.
