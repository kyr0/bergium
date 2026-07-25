# Bergium implementation plan

## Definition of done

Bergium keeps Butterchurn/Webamp integration stable while exposing two renderer
pipelines to one canvas. Classic Geiss is a source-derived behavioral port of the
pinned Geiss 4.30 code, not merely a similar feedback effect. MilkDrop remains a
mechanical TypeScript port of pinned Butterchurn until golden tests prove no
drift. New 3D/JSON behavior is an extension and cannot alter classic results.

Read first:

- `docs/provenance.md` - revisions, licensing and honest meaning of "1:1";
- `docs/geiss-reference.md` - exact constants, mode table, map formulas and quirks;
- `docs/butterchurn-drift-guard.md` - Butterchurn audio/render ordering to freeze.

## Goals

Bergium is a modern, TypeScript-first successor to Butterchurn. It is one engine,
Webamp-integration-compatible, that forks Butterchurn's MilkDrop pipeline and adds a
faithful Geiss rendering pipeline, driven by fast AudioWorklet-based audio analysis
in TypeScript over the project's ringbuf.js transport. Renderers and presets are
pluggable and data-driven: each pipeline implements one `RendererPipeline` contract
and is selected by a versioned, declarative preset - never by executable user source.

- Preserve Butterchurn's default export and `createVisualizer`, `connectAudio`,
  `loadPreset`, `setRendererSize`, `launchSongTitleAnim`, `render` behavior.
- One WebGL2 device/canvas; pipeline-owned FBO targets; compositor-owned present.
- `geiss-4.30-plugin-8bit` exact profile first, then distinct true-color profile.
- Ringbuf.js AudioWorklet capture with the Geiss analysis state machine outside
  the realtime callback; MessagePort and existing AnalyserNode fallbacks.
- Fixed simulation steps, deterministic PRNG, recorded audio fixtures and
  intermediate-pass snapshots.
- Declarative, versioned Bergium 3D presets; feedback/overlay text destinations.
- Pluggable renderer architecture: one `RendererPipeline` interface per pipeline
  (MilkDrop, Geiss classic/3D, future), routed by `BergiumVisualizer`; pipelines
  receive targets and never own the GL context or presentation.
- A `PresetRegistry` with JSON-Schema validation/migration as the only preset entry
  point.

## Non-goals

- Claiming generic WebGL linear sampling or arbitrary browser audio windows are
  pixel-identical to DirectDraw/x86 output.
- Translating MilkDrop presets to Geiss or sharing their simulation semantics.
- Rewriting EEL/WASM, shaders, texture formats or audio constants during the
  Butterchurn TypeScript conversion.
- Arbitrary JavaScript/GLSL in JSON presets, a full scene graph, editor or store.
- Reproducing dead experimental source branches as selectable classic behavior.
- Building, instrumenting or running a native Geiss executable. The pinned Geiss C
  source is a read-only reference for checking behavior, not a build or test target.
- Building or testing Milky.js. It is retained only as historical reference for why a
  naïve feedback prototype diverges from Geiss (see "Why the Milky.js prototype is
  similar, not equivalent"); that knowledge already lives in this project.

## Reference repositories (read-only)

The pinned sources are checked out under the gitignored `vendor/` directory (see
`docs/provenance.md`) for reading and behavioral cross-checking only. They are never
imported by the build, never built, and never executed by the test suite:

- `vendor/geiss` - the authoritative C reference for Geiss constants, mode table,
  map formulas and quirks. Read it to verify the oracle; do not compile or instrument.
- `vendor/butterchurn` - the fork base for the MilkDrop pipeline and the
  compatibility contract; golden frames are captured from it running in a browser.
- `vendor/ringbuf.js` - the SPSC ring transport used by the audio capture path.
- `vendor/webamp` - the host whose `createVisualizer` integration surface we preserve.
- `vendor/milky.js` - cautionary reference only; not built, not tested.

## Stable boundaries

| Owner | Owns | Never owns |
| --- | --- | --- |
| `BergiumVisualizer` | API, lifecycle, routing | renderer math |
| `AudioEngine` | capture adapters, normalized host audio | visual state |
| Geiss analyzer | signed-byte reference window, volume/beat/Fourier state | transport, drawing |
| `GraphicsDevice` | one GL context, targets, resources | presets |
| pipeline | simulation and passes | visible-canvas presentation |
| `Compositor` | pipeline blend, output, crisp text | feedback simulation |
| `PresetRegistry` | validation/migration | executable user source |

Keep `simulate()` independent of `render()`. A 144 Hz display may present more
often but must not accelerate 30 Hz state evolution. Classic exact mode may run
at a declared source FPS because several rates are FPS-corrected and
`floatframe` advances by `1.6*min(1,47/fps)`.

## Ringbuf.js audio design

`audio-capture.worklet.ts` interleaves a Web Audio render quantum into a reused
Float32 array. It commits PCM first and a fixed eight-word metadata record second
to two SPSC ringbuf.js rings. If either ring lacks capacity, it drops the entire
quantum and flags the next record. It never allocates, waits, resamples or runs an
FFT in `process()`.

The main/worker consumer:

1. reads a complete metadata record and exactly its declared PCM element count;
2. detects sequence/discontinuity and preserves explicit analyzer decay state;
3. resamples to the profile's 44.1 kHz reference clock;
4. quantizes to signed bytes with a declared truncation rule;
5. produces the 512-sample-compatible Winamp window;
6. runs `GeissAudioAnalyzer` once per simulation frame;
7. separately derives Butterchurn's original 1024-byte/512-sample FFT arrays.

Do not force both pipelines through one "improved" spectrum. Shared capture is
correct; shared analysis would cause drift. SharedArrayBuffer needs cross-origin
isolation, so retain Worklet/MessagePort and AnalyserNode paths. Compare all
adapters from the same recorded PCM, not from simultaneous live nodes.

### Geiss analysis contract

The oracle in `GeissAudioAnalyzer.ts` preserves the plugin level trigger using
`last_frame_v/slope`, signed byte `<<8` conversion, `.8/.2` two-sample smoothing,
`volscale=.20`, width scaling, sparse DC removal, 120-slot history, four
FPS-adjusted averages, beat hysteresis 109/71, big-beat threshold 1.10, waveform
brightness and slide-shift PRNG consumption. The true-color profile additionally
runs the 24-band direct Fourier loop; suggested map damping is reset to 1.0 as in
the source. Spectrum input is a separate branch and must preserve its signed
16-bit conversion/decay semantics before it can be labeled exact.

## Classic Geiss renderer

Normative per-step order:

1. Advance `floatframe`, `intframe`, mode-frame counter; palette blend/clear flags.
2. Inject selected shade, chasers, bar, dot chaser, nuclide, grid and solar into
   the previous feedback buffer; diminish center.
3. Warp previous to next through the active destination-to-source map using four
   independently truncated byte weights and integer `sum >>> 8`.
4. Update volume and add audio-triggered nuclide blobs to the next buffer.
5. Draw one of six reachable waveforms with max writes into the next buffer.
6. Swap buffers. Apply palette/title/display conversion without contaminating
   scalar 8-bit feedback.

`GeissFrameGraph.ts`, `MapField.ts`, `FeedbackWarp.ts`, `WaveformRenderer.ts`,
`Palette.ts` and `ModeStateMachine.ts` are readable CPU oracles. GPU passes must
match those oracles; they are not permission to simplify the rules.

### Why the Milky.js prototype is similar, not equivalent

Its core insight-recursive feedback plus waveform injection-is right, but its
dynamics differ: a computed fade buffer is overwritten by the subsequent copy;
palette-colored RGBA is fed back and the red channel becomes the next index;
transform sampling is nearest-neighbor and globally parameterized rather than a
quantized spatial map; pass/layer ordering differs; wall-clock seeding prevents
replay; and simulation follows render calls. Exact Geiss keeps scalar intensity
through feedback in 8-bit mode, uses byte-weighted four-tap destination-to-source
maps, preserves pre/post-warp injection order, and advances declared frame state.
The right path is the reference frame graph, not more post-effects on the prototype.

### GPU representation

- `R8UI` ping-pong textures for classic intensity if integer renderability is
  reliable; otherwise an RGBA8 target whose red byte is the normative value.
- Map texture stores integer source base coordinate and four byte weights.
- Fragment shader uses `texelFetch`, four integer products and `>>8`; no hardware
  filtering in exact mode. A perceptual profile may use RG coordinates + linear
  filtering but must use a different profile name.
- Pre/post injection can use raster geometry, but max/add saturation must match
  CPU oracle. Ordered writes that affect each other require an intermediate pass.
- Palette is a 256x1 LUT sampled only by presentation in the 8-bit profile.
- True-color uses separate BGRA feedback resources and its source-specific color
  writers/output rules; it is not "8-bit plus a color post-effect."

### Map lifetime

Generate a complete pending map from one snapshotted parameter/PRNG state. Modern
hardware may calculate it immediately, but activation remains source-timed: rush
or non-beat mode activates immediately; beat mode waits for `bBigBeat` while the
threshold decreases `.2/modeFrames`. X wraps with `W-1`, flattened Y clamps to
rows 2...`H-3`, damping uses FPS-at-switch, and source quirks remain fixture-tested.

## Butterchurn pipeline

Fork the pinned source and add types leaf-first. First adapt its current Renderer
to a supplied FBO and move only final presentation to `Compositor`. Do not modify
warp/comp/output shaders, per-frame/per-pixel equation order, EEL/WASM coercions,
audio arrays/level smoothing, mipmap timing, texture filters, blur ratios, sprite
order or preset blending. See `docs/butterchurn-drift-guard.md` for exact order.

The shared `AudioFrame` is a transport envelope, not a mandate to replace
Butterchurn's `AudioProcessor`/`AudioLevels`. Its legacy arrays remain available
through a typed compatibility view until exact array fixtures pass.

## JSON 3D and text

Classic mode accepts a small compatibility preset: profile, seed, source mode,
options and timing. `geiss-3d` accepts bounded known emitters, camera and layer
placement, but reuses the explicit feedback transport. No extension operator may
enter a classic profile.

Text has two explicit destinations: `feedback` is rasterized into a selected
pipeline layer and therefore trails/warps; `overlay` is composed after pipelines
and stays crisp. Begin with DPR-aware Canvas2D shaping cached into textures;
introduce MSDF only for persistent/3D text. Never scrape renderer internals for
Webamp title support-keep the public title method and temporary shim.

## Implementation phases and gates

1. **Freeze Butterchurn:** API contracts, build/export paths, audio arrays,
   equations and three intermediate render snapshots. Gate: pinned presets match.
2. **Extract device/compositor:** current renderer writes a supplied target.
   Gate: no golden delta and resource cleanup passes.
3. **Capture once, analyze twice:** ringbuf fast path plus fallbacks. Gate: PCM
   record/replay parity; Butterchurn arrays exact; Geiss state exact.
4. **Classic CPU oracle:** deterministic mode/map/effect/audio/wave/palette state.
   Gate: the seeded CPU oracle reproduces state at 320x240 and 640x480 under a
   declared profile; the pinned Geiss C source is read to confirm behavior - never
   built or instrumented.
5. **Classic GPU:** integer feedback/map/injection passes. Gate: per-pass texture
   comparisons against the CPU oracle, then in-browser (headless Chromium) visual
   fixtures; no native rendering is involved.
6. **True color:** implement as separate profile. Gate: BGR feedback snapshots.
7. **3D JSON and text:** only after classic and MilkDrop gates remain green.
8. **TypeScript 7 completion:** strict public/core types, then leaf conversion;
   generated preset runners/shaders remain frozen assets where appropriate.

## Validation fixtures

Each case stores source revisions, profile, resolution/display depth, seed and
PRNG algorithm, option registry values, FPS sequence, mode transition frame,
signed audio bytes/PCM clock and expected state trace. Assert effect choices,
waveform, map texels/weights, volume averages, beat flags, slide offset, palette,
post-effect buffer, post-warp buffer and final output. Cross-GPU final images use
a documented tolerance; integer intermediate textures and state arrays are exact.

Expected traces are generated from the source-derived CPU oracle and recorded-PCM
replay under the declared profile, then frozen as fixtures. They are never produced
by a native Geiss build or instrumentation; the C source is consulted by reading.
MilkDrop golden frames are captured from the pinned Butterchurn running in a browser.

## Where to touch / not touch

Touch: API adapters, target ownership, audio transport, new Geiss oracle/GPU
modules, compositor, public text facade, schemas, fixtures and deterministic
clock/PRNG. Do not touch while porting: Butterchurn equation/shader math or order,
Geiss constants/PRNG consumption/order, palette placement, interpolation
quantization, source quirks, or fallback semantics without a versioned profile.
