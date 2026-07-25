# Butterchurn drift guard

Butterchurn is preserved as a pipeline, not reinterpreted through Geiss
abstractions. The TypeScript port must first be a mechanical port of the pinned
revision and retain its numeric coercion, shader strings, preset equation order,
resource formats and blending behavior.

## Current observable contract

- `createVisualizer(audioContext, canvas, opts)` owns an internal WebGL2 canvas
  and presents it to the caller's 2D canvas.
- Default internal size is 1200×900; default mesh is 48×36.
- WebGL2 context flags are alpha/antialias/depth/stencil/premultiplied-alpha off.
- Audio uses 512 delivered samples from a 1024-sample analyser window. Web Audio
  unsigned bytes are shifted to signed bytes; channel samples are averaged with
  the preceding sample and every second value is retained.
- FFT input is the full 1024 signed-byte window. Bass/mid/treble boundaries are
  20–320, 320–2800 and 2800–11025 Hz (rounded into bins as the source does).
- Frame audio averages use attack/release rates 0.2/0.5; long average uses 0.9
  for the first 50 frames and 0.992 thereafter, adjusted by `rate^(30/fps)`.

## Render order that must not drift

1. Sample/update audio; calculate normalized audio levels.
2. Run current per-frame and per-pixel equations; also previous preset while
   blending, then mix frame equations.
3. Swap feedback textures/FBOs and generate mipmaps for the previous texture.
4. Warp previous feedback into the target (current and previous warp shaders
   during a preset blend).
5. Produce requested blur levels and rebind the target.
6. Draw motion vectors, custom shapes, custom waves, then the previous preset's
   shapes/waves during blending.
7. Draw basic waveform, darken center, outer border, inner border and title.
8. Composite/output to the visible canvas, including existing output FXAA rules.

Texture wrap/filtering, mipmap generation timing, blur ratios
`[(.5,.25),(.125,.125),(.0625,.0625)]`, shader math and GL blend functions are
part of the golden contract. Do not “share” Geiss's palette, waveform, fixed
simulation clock or scalar feedback with this pipeline.

## Safe extraction seam

Wrap the existing renderer behind `MilkdropPipeline`; inject its output target,
clock and already-compatible audio arrays. Keep its equation runners and render
objects together until golden frames pass. Only the final present-to-canvas step
moves to `Compositor`. Preserve a compatibility facade for Webamp-facing API.

## Drift tests

For each pinned preset, record preset JSON, seeded RNG mode, 1024-byte mono/L/R
audio fixtures, viewport/DPR/texture ratio, elapsed-time sequence, and GPU
fingerprint. Compare intermediate warp target, post-sprite target and final
output. Use tolerant image metrics across GPUs and exact array assertions for
equations/audio. Any intentional delta needs a fixture-version bump and note.

