# Geiss 4.30 behavior reference

This is the compact normative specification for classic mode. It is derived from
the pinned sources listed in `provenance.md`; comments and dead experimental code
are not silently promoted into behavior.

## Profiles and global constants

| Item | Original value / rule |
| --- | --- |
| modes | 25 |
| selectable waveforms | 6 (`waveform == 7` code is unreachable) |
| effects | source allocates 9 slots; eight are named; the unnamed ninth retains constructor threshold `1000/9` => 111 and can consume the effect-count budget without drawing |
| volume history | 120 frames |
| Fourier detail | 24 bands; active only above 8-bit display mode |
| initial audio averages | current 0; normal/wide/narrow 1; peak average 100 |
| scale controls | `volpos=10`, `volscale=.20` |
| initial FPS | 40; normal compatibility simulation is 30 Hz |
| mode duration | registry/default 550 frames at 30 Hz, rescaled by `fps/30` for 10-120 FPS |
| palette | gamma setting 10; solar/coarse palette frequencies 1 |
| slide shift | enabled; source checks more than 2 frames despite a separate default minimum of 5 |
| map centers | `W/2-1 + rand%60-30`, `H/2-1 + rand%30-15` |
| active vertical cut | `max(4,(65-.65*verticalSizePercent)*.5*.01*H)`; plugin default percent 100 therefore cut 4 |
| plugin audio buffer | `min(1023,max(W*2,748))`; 748 is `(314+50)*2+20` |
| map weights | nominal sum 256; resolution sum is 250,251,252,253,254,255 by area thresholds 320x240, 400x300, 512x384, 800x600, 1280x960, else |

`255`, not `256`, at high resolution is deliberate: individual bilinear weights
are stored in bytes and 256 would wrap. Four products are independently
truncated to bytes, so their actual sum may be lower.

## Frame graph

```text
VS1 previous state
  -> pre-warp effects in VS1
  -> manual mapped four-tap sample VS1 into VS2
  -> volume/nuclide dots in VS2
  -> waveform in VS2
  -> swap VS1/VS2
  -> song title and display conversion
```

`RenderFX` advances time and draws shade bobs, two chasers, bar, dot chaser,
nuclide effect, grid and solar particles, then diminishes the center. The map
process follows. `RenderDots` both updates the volume state and may add
audio-triggered nuclide blobs after the warp. `RenderWave` is also post-warp.
In 8-bit mode the recursive state is intensity and the palette is display-time.

## Mode configuration table

Effect columns are selection thresholds out of 1000. `sel` is min-max effects.
Every row also has the unnamed ninth threshold 111.

| mode | ch | bar | dot | solar | grid | nuc | shade | spectral | solar max | center | sel |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 220 | 150 | 10 | 680 | 4 | 170 | 400 | 0 | 400/800* | 1 | 1-2 |
| 2 | 750 | 500 | 750 | 750 | 0 | 0 | 0 | 0 | 35 | 1 | 1-5 |
| 3 | 100 | 100 | 100 | 500 | 10 | 0 | 300 | 0 | 60 | .99 | 1-2 |
| 4 | 500 | 100 | 100 | 100 | 30 | 0 | 0 | 0 | 34 | .98 | 1-2 |
| 5 | 100 | 350 | 100 | 500 | 15 | 180 | 500 | 0 | 60 | .99 | 1-2 |
| 6 | 400 | 120 | 200 | 0 | 0 | 0 | 0 | 0 | 60 | 1 | 1-2 |
| 7 | 50 | 200 | 0 | 300 | 0 | 600 | 350 | 0 | 65 | .985 | 1-2 |
| 8 | 150 | 150 | 150 | 150 | 25 | 0 | 0 | 0 | 60 | .96 | 1-2 |
| 9 | 450 | 200 | 50 | 200 | 0 | 100 | 200 | 0 | 50 | .985 | 1-2 |
| 10 | 150 | 20 | 80 | 0 | 0 | 80 | 0 | 0 | 0 | 1 | 0-2 |
| 11 | 360 | 200 | 230 | 550 | 10 | 330 | 150 | 0 | 750 | 1 | 0-4 |
| 12 | 360 | 200 | 230 | 0 | 0 | 330 | 0 | 0 | 500 | .915 | 0-2 |
| 13-14 | 500 | 0 | 100 | 0 | 30 | 0 | 0 | 0 | 34 | .98 | 1-2 |
| 15 | 0 | 0 | 0 | 0 | 0 | 200 | 0 | 0 | 60 | 1 | 0-1 |
| 16 | 500 | 100 | 100 | 100 | 30 | 0 | 0 | 0 | 34 | .98 | 1-2 |
| 17-25 | 150 | 150 | 150 | 150 | 12 | 0 | 50 | 0 | 600 | .98** | 1-3 |

`*` 400 for 8-bit, 800 otherwise. `**` only modes 20-23 are overwritten to .98;
the others retain the initialized 1.0 unless another assignment applies.

Above 8-bit, per-mode thresholds are modified: nuclide x1.3; chasers -50;
dots/bar +220; shade +150 (all clamped to 0-900). Grid always gains 8, capped
at 1000. Selection uses `rand()%1000 < threshold`; when sound is active and
nonempty the threshold is multiplied by .7. Values >=1000 are forced. Excess
effects are randomly disabled; the minimum is only enforced for absent/empty
sound. Grid disables bar. Chasers becomes variant 1 or 2.

## Motion map families

Coordinates are destination-to-source. `dx=x-centerX`, `dy=y-centerY`, and
`rmult=640/W`. Modes 1-16 use the standard rotate/scale path except custom modes
6, 10, 12. Modes 1, 9, 11 checkerboard between two rotate/scale parameter pairs.

- 3: `scale=.95 - dy*(480/H)*.0005`
- 4: `scale=.9 + hypot(dx,dy)*rmult*.0025*.14`
- 5: `r=hypot(dx,dy)/200*rmult`; `r=sqrt(r)` without nuclide, else `r*=1.7`;
  `scale=f2-f1*r`, then resolution protection.
- 7: `scale=f1-hypot(dx,dy)*f2*rmult`, protected, plus a prebuilt random-array value.
- 8: `scale=.85+.1*sin(sqrt(hypot(dx,dy)*rmult)*f1)`.
- 9: `scale=f1-hypot(dx,dy)*f2*rmult`, protected.
- 13: `scale=1+(1.04-r*sqrt(r)*.00025*.14-1)*f1`, `r=hypot*rmult`.
- 14: `scale=.9+.2*cos(dy*12/(H+(rand&1023)/1024))`; random consumption is per pixel.
- 15: `scale=f2+f3*sin(atan2(dy,dx)*f1)`.
- 16: `scale=max(-1.5,1.05-r*r*.00025*.09)`.
- 17: `.97-(dy/W)^2*.40`; 18 swaps x/y; 19 `1.04-.25*hypot(dx/W,dy/W)`;
  20 `1.15-.20*sqrt(dy/W+1.4)`; 21 quantizes absolute x/y into tenths;
  22 quantizes radius into tenths; 23 quantizes radius into twentieths modulo 4;
  24 forces scale .96 and turn .05; 25 `3/(3+normalizedRadius)`.

Custom mode 6 sums five inverse-square translation/rotation influence fields,
normalizes by `1.9/sum`, then adds `(-.1,+.6)`. Initialization creates ten
fields but only five are read: preserve this quirk. Mode 10 maps
`x'=dx*(1.03+.03*y/H)+centerX`, `y'=1.04*y`. Mode 12 is the three-way sideways
square-root splitter shown in `MapField.ts`.

After mapping, source coordinates are damped toward the destination. Damping is
scaled by `30/fpsAtModeSwitch` and halved for the source's dampened-mode table.
X wraps with period `W-1`; Y is indirectly clamped by flattening the source index
to rows 2 through `H-3`. A pending map activates immediately in rush/non-beat
mode, or on a big beat; while waiting its threshold drops by `.2/modeFrames`.

## Audio and waveform invariants

The reference audio implementation is in `GeissAudioAnalyzer.ts`. It preserves:
signed-byte input semantics, the Winamp level-trigger scan, `.8/.2` two-sample
smoothing, sparse DC removal, 120-frame volume tape, FPS-corrected averages,
beat hysteresis 109/71, big-beat comparison against array slots 0-39, and the
24-band direct Fourier loop. The source computes a suggested damping value but
then resets it to 1.0; exact mode does the same.

Waveforms 1-6 are horizontal, twin horizontal, vertical, twin diagonal, radial,
and rotated stereo XY. Wave pixels use max blending, not alpha blending. High
resolution doubles samples one or two times and amplifies each next endpoint by
1.14. Palette/gamma must never be fed back in 8-bit mode.

## Source anomalies deliberately surfaced

- Ninth effect slot has no named enum behavior.
- Waveform 7 and a second mode-16 initialization branch are unreachable.
- Mode 6 initializes ten influence fields but evaluates five.
- Big-beat `max_vol` reads physical history slots 0-39 rather than the newest
  logical third of the ring.
- The old x86 map carries/clears low accumulator bits in assembly-specific ways;
  exact portable mode declares a deterministic carry policy instead of invoking
  undefined or patch-generated machine behavior.
