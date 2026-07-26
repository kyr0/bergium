# Bergium × Webamp Demo

A thin Vite app that plays the [Archive.org **Trancemaster**](https://archive.org/details/Trancemaster)
playlist in our vendored [Webamp fork](../../packages/webamp-bergium), with
**bergium** as the visualizer.

Webamp's `webamp/butterchurn` entry has been rewired (in the fork) to inject
[`bergium-core`](../../packages/bergium)'s [`createBergiumPlayer`](../../packages/bergium/src/api/BergiumPlayer.ts)
as Webamp's visualizer. So Webamp's single milkdrop window:

- renders via bergium's **Milkdrop** pipeline (butterchurn-compatible port),
- switches to bergium's **Geiss** pipeline (GPU feedback warp) when you **click the
  visualizer**,
- auto-cycles Geiss modes every **30s** (chasers on by default),
- auto-cycles Milkdrop presets every **30s**,
- shows the **current song title** overlay on track change.

All of that complexity lives inside `bergium-core` / the fork — this app just loads
the playlist and renders Webamp.

## Prerequisites (one-time)

This app consumes Webamp from the fork's pre-built bundles, and bergium-core stays
**external** to those bundles (its GLSL `?raw` assets can't be inlined by the fork's
rollup). Build both first, from the repo root:

```bash
# Builds bergium-core, installs the fork, and builds the webamp bundles
# (produces packages/bergium/dist + packages/webamp-bergium/.../built/*.mjs).
# Or build everything with: bun run build:all
bun run build:webamp-bergium
```

The fork resolves `bergium-core` via `"bergium-core": "file:../../../bergium"` (bun's
`file:` protocol — `link:` isn't supported by bun) so its build/type-check resolves it.

## Run

```bash
bun install          # from repo root, picks up apps/webamp-demo
bun run dev:webamp-demo
```

Open the printed URL, press play, and click the visualizer window to toggle
Geiss / Milkdrop.

## Tests

```bash
cd apps/webamp-demo && bun run test
```

Covers the pure Archive.org mapping helpers (`encodeArchivePath`, `fallbackTitle`,
`buildInitialTracks`) and the `fetchArchiveTracks` happy/error paths with a mocked
`fetch`.

## Archive.org / CORS note

Track URLs use the `/download/<id>/<file>?tunnel=1` form. `?tunnel=1` avoids the
normal redirect to a rotating `dn*.archive.org` node and returns a CORS-enabled,
byte-range-capable audio response — required for cross-origin `localhost` playback
(Safari needs it; we add it unconditionally for consistency with Archive.org).

## Attribution

- **Webamp** — Jordan Eldredge, MIT. Vendored fork in `packages/webamp-bergium`.
- **Trancemaster** playlist — [Archive.org item Trancemaster](https://archive.org/details/Trancemaster).
- **bergium** + this demo — Aron Homberg \<info@aron-homberg.de\>, MIT.
