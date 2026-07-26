# Plan: New high-level bergium public API + thin `apps/webamp-demo`

## North star
Encapsulate ALL visualizer complexity — custom Milkdrop presets, inline GLSL shaders,
equation strings, `makeWave`/`makeShape` boilerplate, the `butterchurn-presets` library +
disabled-preset filter, Geiss mode/effect/auto-cycle wiring, Milkdrop preset cycling,
pipeline toggling, song-title overlays, and the render loop — **inside `bergium-core`**
behind a small public API. Both demos ([`apps/demo`](../apps/demo/src/main.ts:1) and the new
`apps/webamp-demo`) and the webamp-bergium fork adapter then become a few simple calls.

## New bergium-core public API (the contract)

```ts
// packages/bergium/src/index.ts (additive; existing exports unchanged)

export interface BergiumPlayerGeissOptions {
  autoMode?: boolean;        // default true
  cycleSeconds?: number;     // default 30
  effects?: { chasers?: boolean; shadeBobs?: boolean; grid?: boolean }; // default {chasers:true}
}
export interface BergiumPlayerMilkdropOptions {
  cycleSeconds?: number;     // default 30
  initialPresetIndex?: number;
  getPresets?: () => Promise<{ name: string; preset: unknown }[]>; // default = getBuiltinPresets
}
export interface BergiumPlayerOptions {
  width?: number; height?: number;
  initialPipeline?: "geiss" | "milkdrop";   // default "milkdrop"
  autoRender?: boolean;          // default true (own RAF). webamp sets false (it drives render).
  canvasClickToggles?: boolean;  // default true — click the canvas toggles pipeline
  geiss?: BergiumPlayerGeissOptions;
  milkdrop?: BergiumPlayerMilkdropOptions;
}

export interface BergiumPlayer {
  // audio + size
  connectAudio(node: AudioNode): void;
  disconnectAudio(): void;
  setRendererSize(width: number, height: number): void;
  // rendering
  render(): void;               // one frame (driven externally when autoRender:false)
  start(): void; stop(): void;  // internal RAF loop (autoRender:true)
  // pipeline
  setPipeline(p: "geiss" | "milkdrop"): void;
  togglePipeline(): void;
  getPipeline(): "geiss" | "milkdrop";
  setGeissEffect(name: "chasers" | "shadeBobs" | "grid", enabled: boolean): void;
  // overlays / presets (also butterchurn-compatible so it can be injected into webamp)
  launchSongTitleAnim(title: string): void;
  loadPreset(preset: unknown, transitionSeconds?: number): void;
  destroy(): void;
}

export function createBergiumPlayer(
  audioContext: AudioContext,
  canvas: CanvasLike,
  options?: BergiumPlayerOptions,
): BergiumPlayer;

export function getBuiltinPresets(): Promise<{ name: string; preset: unknown }[]>;
```

### What `BergiumPlayer` owns (so demos don't)
- Creates both bergium pipelines via [`createVisualizer`](../packages/bergium/src/api/createVisualizer.ts:18)
  on the **same** canvas (toggling destroys + recreates, like
  [`apps/demo`](../apps/demo/src/main.ts:546)'s `<select>`).
- Geiss defaults: dynamic size, [`setAutoMode(true)` + `setAutoCycleSeconds(30)`](../packages/bergium/src/adapters/GeissAdapter.ts:396),
  [`setEffect("chasers", true)`](../packages/bergium/src/adapters/GeissAdapter.ts:366).
- Milkdrop: 30s preset cycle over `getBuiltinPresets()` calling
  [`loadPreset(preset, 2.7)`](../packages/bergium/src/pipelines/milkdrop/port/butterchurn.ts:168).
- Song-title overlay via [`launchSongTitleAnim`](../packages/bergium/src/pipelines/milkdrop/port/butterchurn.ts:307)
  (Milkdrop) / Geiss overlay.
- Forces `onlyUseWASM:false` (webamp hardcodes `true`; bergium's active path is JS presets).
- Optional internal RAF loop.

### Built-in presets (new in bergium-core: `packages/bergium/src/presets/builtin/`)
- `customPresets.ts` — move WarpGrid / Tunnel Vision / Rubik's Cube (+ `makeWave`/`makeShape`)
  out of [`apps/demo`](../apps/demo/src/main.ts:26).
- `disabled.ts` — move the `DISABLED_PRESET_NAMES` set out of
  [`apps/demo`](../apps/demo/src/main.ts:219).
- `index.ts` → `getBuiltinPresets()`: custom presets + `BlankPreset` + lazily dynamic-imports
  `butterchurn-presets` (filtered by `disabled.ts`). bergium-core adds `butterchurn-presets`
  as a dependency (lazy `import()`).

## Phases

### Phase 0 — bergium-core API + presets (foundation)
- New `src/api/BergiumPlayer.ts` (+ `createBergiumPlayer`), `src/api/createBergiumPlayer.ts`.
- New `src/presets/builtin/{customPresets,disabled,index}.ts`.
- Export from `src/index.ts`; add `butterchurn-presets` to `packages/bergium/package.json`
  deps; add GLSL files (moved with custom presets) to the build copy step if needed.
- Tests (`tests/`): preset provider (filtering, shape), player lifecycle/pipeline-toggle with
  mocked `createVisualizer`, defaults application (chasers, 30s). Coverage target.

### Phase 1 — refactor `apps/demo` to the thin API
- `src/main.ts` shrinks to: canvas/audio/analyser → `createBergiumPlayer(ctx, canvas, opts)`
  → `connectAudio(analyser)` → `start()`. Keep a minimal UI (Play + pipeline toggle +
  optional effect/preset controls calling player methods). Delete inline presets/shaders,
  the preset registry, cycling, and the manual pipeline-switch machinery.

### Phase 2 — webamp-bergium fork adapter
- `js/webampWithButterchurn.ts`: `importButterchurn` returns
  `{ createVisualizer: (ctx, canvas, opts) => createBergiumPlayer(ctx, canvas, {
      autoRender:false, canvasClickToggles:true, initialPipeline:"milkdrop",
      geiss:{effects:{chasers:true}, cycleSeconds:30}, milkdrop:{cycleSeconds:30, getPresets: bergiumPresetSource} }) }`.
  So `webamp/butterchurn` now means the bergium Geiss+Milkdrop player. No separate adapter
  file needed — `BergiumPlayer` already implements the butterchurn contract.
- `scripts/rollup.mjs`: keep `bergium-core` external (no GLSL `?raw` loader in the fork).
- webamp `package.json`: add `bergium-core` link for type-checking.

### Phase 3 — `apps/webamp-demo` (thin)
- `package.json` (deps `bergium-core` `workspace:*`; devDeps vite/typescript/vitest),
  `tsconfig.json`, `vite.config.ts` (alias `webamp` + `webamp/butterchurn` → fork built
  bundles; `optimizeDeps.include:["bergium-core","butterchurn-presets"]`).
- `index.html` (`#webamp` container + black bg), `src/main.ts` (Trancemaster metadata →
  `new Webamp({ zIndex, initialTracks, enableMediaSession })` → `renderWhenReady`),
  `src/archive.ts` (pure helpers) + `src/archive.test.ts` + `vitest.config.ts`, `README.md`.

### Phase 4 — root
- `package.json`: add `apps/webamp-demo` to `workspaces` + `dev:webamp-demo`/`build:webamp-demo`.
- `README.md`: document the new public API, the webamp-demo app, and run instructions.

## Prerequisite
1. `bun run build:bergium` (Phase 0 changes).
2. `cd packages/webamp-bergium && pnpm install && pnpm --filter webamp build` (Phase 2).
3. `bun run dev:webamp-demo` (Vite alias resolves the rebuilt bundle + bun-workspace bergium-core).

## Risks / notes
- `butterchurn-presets` becomes a bergium-core dep (lazy import) — demos no longer import it directly.
- Player-driven 30s preset cycle coexists with webamp's manual preset picker (webamp feeds
  `loadPreset` → player restarts its cycle; UI may not reflect auto-cycled preset — accepted).
- bergium-core stays external to the webamp bundle (GLSL `?raw` loader missing in fork rollup).
