# Bergium Geiss code patchset

Generated against the uploaded Bergium Geiss subtree corresponding to repository state around commit `472ecb1e511001c03c52c4473e67af0aad41750b`.

## Apply

From the Bergium repository root:

```bash
/path/to/bergium-geiss-patchset/check-apply.sh .
/path/to/bergium-geiss-patchset/apply.sh .
```

Alternative, without preserving individual commits:

```bash
git apply /path/to/bergium-geiss-patchset/bergium-geiss-core-combined.patch
```

## Included code

1. Explicit C numeric conversion helpers.
2. Checkpointable MSVC CRT RNG with call count.
3. Literal 8-bit source-order ports of:
   - ShadeBobs;
   - Two Chasers variants;
   - Solid Bar;
   - Dot Chaser;
   - silent/empty pre-warp Nuclide;
   - both Solar Particle variants;
   - Grid;
   - Diminish Center.
4. Source-exact map quantization profile using C truncation and unsigned-byte wrapping.
5. Source-timed pending-map builder preserving mode-14 RNG interleaving.
6. Exact `FX_Init` RNG order for chaser offset, scatter table, micro particles, palette frequencies, and mode-7 random array.
7. Portable source-order 8-bit frame executor with post-warp waveform placement.
8. Direct scalar WebGL2 palette presenter with no `readPixels`, `ImageData`, or temporary Canvas2D staging.
9. Oracle tests and deterministic fixtures.

## Verification performed

- TypeScript strict/noUncheckedIndexedAccess compilation of the complete Geiss reference subtree.
- Independent C/TypeScript equality for these cumulative 640×480 8-bit stage hashes:

```text
init      be58dfc32a472d25
shade     ea0f086a15a5cd3e
chasers   b2f8350ae05aee6a
solid     4e8c2f0e4538207a
dot       9172abc3812c24a9
grid      421021c1dc80675a
diminish  1a956297b3b7fc4c
```

## Deliberately not claimed complete

This tranche does not yet replace `GeissAdapter` automatically. The current adapter owns an all-GPU feedback state whose generic contribution passes cannot express several exact ordered read/modify/write effects. The new `GeissClassicFrame8` and `GeissScalarPresenter` are the intended replacement backend seam.

The historical active x86 pair-accumulator warp is also not mislabeled as complete. `GeissClassicFrame8` explicitly identifies its current warp as `portable-four-tap`; the x86 oracle/backend remains a separate next patch.
