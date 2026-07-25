# Provenance and fidelity policy

This scaffold is a source-derived reimplementation specification, not a legal
"clean-room" implementation. A clean room normally separates a team that writes
a behavioral specification from a second team that has never seen the source.
Here, the same analysis intentionally reads Geiss and expresses its behavior in
new TypeScript-shaped code. Geiss is BSD-3-Clause licensed, so the honest route
is attribution, preservation of its license/notice when code is distributed,
and an independent implementation rather than pretending no source was read.

## Pinned sources

| System | Revision used | Authoritative files |
| --- | --- | --- |
| Geiss | `fcc6d57444fc28293894d8de6f0281ca3308ae38` | `main.cpp`, `proc_map.cpp`, `video.h` |
| Butterchurn | `fbac2f6bab62fd9c6a50ebbeb29359c5eb05903e` | `src/visualizer.js`, `src/rendering/renderer.js`, `src/audio/*`, shaders/equations |
| ringbuf.js | TypeScript port `d55cb9a5d3ad84933cc9e7a84da5b558e75a90e8`, reviewed head `7996bf20b3e6872d7a15da551c4e990c7f4dff94` | package API and TypeScript source |

The active Geiss build compiles `main.cpp` and `proc_map.cpp`. `SOUND.CPP`
contains older standalone variants and is not the authority where it differs
from the implementations embedded in `main.cpp`.

## Local vendored copies

The pinned sources (plus the Webamp host) are checked out under the gitignored
`vendor/` directory for behavioral comparison only. They are never imported by
the build or the tests (`vendor/` is in `.gitignore` and outside the `src`/`tests`
roots), and `bun test tests` is scoped so vendored test files are never executed.

| Path | Upstream | Revision |
| --- | --- | --- |
| `vendor/geiss` | github.com/geissomatik/geiss | `fcc6d57444fc28293894d8de6f0281ca3308ae38` |
| `vendor/butterchurn` | github.com/jberg/butterchurn | `fbac2f6bab62fd9c6a50ebbeb29359c5eb05903e` |
| `vendor/ringbuf.js` | github.com/padenot/ringbuf.js | `d55cb9a5d3ad84933cc9e7a84da5b558e75a90e8` |
| `vendor/milky.js` | github.com/kyr0/Milky.js | `e5ed87be927f870d6ff22c807deef3ccd4309103` |
| `vendor/webamp` | github.com/captbaritone/webamp | floating `master` head (host reference only; not pinned) |

Re-create any entry with:

```sh
git clone <upstream> vendor/<name>
git -C vendor/<name> checkout <revision>
```

### Phase 1 Butterchurn freeze reference

The vendored `vendor/butterchurn` source (revision `fbac2f6...`) requires an
AssemblyScript=>WASM rollup build to run. For the Phase 1 freeze (running the
pinned renderer in-browser behind `MilkdropPipeline` and capturing golden
snapshots), the **published prebuilt `butterchurn@3.0.0-beta.5`** is used as the
runtime-injected reference: it is the release artifact of that exact pinned
version. It is a dev dependency only - the library never imports it; the eventual
in-tree TypeScript port (plan Phase 8) replaces it.

## Fidelity labels

- **EXACT:** same order, constants, integer conversion and state transition.
- **HOST-DEFINED:** the original depends on Winamp, DirectDraw, C `rand()`, x86
  overflow, display depth, or another platform detail. The compatibility profile
  declares a replacement.
- **MODERN-EQUIVALENT:** different mechanism with an explicitly tested equivalent
  result, such as a texture coordinate field replacing relative pointer deltas.
- **EXTENSION:** Bergium-only behavior and never part of classic mode.
- **SOURCE-QUIRK:** suspicious but reachable original behavior preserved in exact
  mode. Unreachable code is documented and omitted.

## What "1:1" can honestly mean

The initial target is frame-state and pass-order equivalence for a declared
profile: resolution, display-depth path, sample stream, sample rate, frame rate,
random sequence and options. Pixel identity requires a compatible PRNG, byte
quantization, signed/unsigned overflow choices, interpolation truncation and
edge policy. WebGL linear filtering, arbitrary `requestAnimationFrame` timing,
or a different audio capture window cannot be called exact.

The default compatibility profile is `geiss-4.30-plugin-8bit`: 44.1 kHz reference
audio, 30 Hz simulation, scalar 8-bit feedback, manual four-tap interpolation,
palette-at-presentation, and deterministic seeded randomness. The 32-bit path is
separate because it feeds BGR color back and therefore is a different dynamical
system.

`MsvcRandom.ts` declares the Visual C runtime `rand()` sequence
(state = state*214013 + 2531011; raw = (state >>> 16) & 0x7fff). That sequence is
pinned and verified against the canonical MSVC output in
`tests/oracle/msvc-random.test.ts`; no native Geiss build or instrumentation is used
or required (the pinned C source is read-only reference). The label stays HOST-DEFINED
only in the sense that the original Winamp build chose this runtime and seed;
substituting xorshift/`Math.random()` would visibly reorder modes, effects, palettes
and per-pixel mode-14 noise.
