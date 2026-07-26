import { Options } from "./types";
import { PrivateOptions } from "./webampLazy";
import Webamp from "./webamp";
// bergium-core replaces the real butterchurn as Webamp's visualizer. It is kept
// external to the webamp bundle (see scripts/rollup.mjs) and resolved by the host
// app, because bergium-core ships GLSL `?raw` assets the fork's rollup can't inline.
import { createBergiumPlayer, getBuiltinPresets } from "bergium-core";

const DEFAULT_BUTTERCHURN_WINDOW_LAYOUT = {
  main: { position: { left: 0, top: 0 } },
  equalizer: { position: { left: 0, top: 116 } },
  playlist: {
    position: { left: 0, top: 232 },
    size: { extraHeight: 4, extraWidth: 0 },
  },
  milkdrop: {
    position: { left: 275, top: 0 },
    size: { extraHeight: 12, extraWidth: 7 },
  },
};

/**
 * Feed Webamp's built-in preset picker from bergium's registry (bergium-authored
 * presets + the non-disabled butterchurn-presets library).
 */
const DEFAULT_REQUIRE_BUTTERCHURN_PRESETS = async () => {
  const presets = await getBuiltinPresets();
  return presets.map(({ name, preset }) => ({
    name,
    butterchurnPresetObject: preset as object,
  }));
};

/**
 * bergium-backed butterchurn module: Webamp calls `createVisualizer(ctx, canvas, opts)`
 * and then drives the returned object with connectAudio / loadPreset /
 * setRendererSize / launchSongTitleAnim / render. BergiumPlayer implements all of
 * these AND toggles Geiss/Milkdrop when the user clicks the visualizer canvas.
 *
 * `autoRender:false` because Webamp's own Visualizer component runs the RAF loop;
 * `autoLoadInitial:false` because Webamp owns the initial preset selection, while
 * the player still auto-cycles presets every 30s.
 */
const bergiumButterchurnModule = {
  createVisualizer(
    audioContext: AudioContext,
    canvas: HTMLCanvasElement,
    opts?: { width?: number; height?: number; meshWidth?: number; meshHeight?: number; pixelRatio?: number },
  ) {
    return createBergiumPlayer(audioContext, canvas, {
      width: opts?.width,
      height: opts?.height,
      initialPipeline: "milkdrop",
      autoRender: false,
      canvasClickToggles: true,
      geiss: { effects: { chasers: true }, cycleSeconds: 30 },
      milkdrop: {
        cycleSeconds: 30,
        autoLoadInitial: false,
        getPresets: async () => getBuiltinPresets(),
      },
    });
  },
};

export default class WebampWithButterchurn extends Webamp {
  constructor(options: Options & PrivateOptions) {
    const requireButterchurnPresets =
      options.requireButterchurnPresets ?? DEFAULT_REQUIRE_BUTTERCHURN_PRESETS;
    super({
      ...options,
      requireButterchurnPresets,
      __butterchurnOptions: {
        importButterchurn: () => Promise.resolve(bergiumButterchurnModule),
        getPresets: requireButterchurnPresets,
        butterchurnOpen: true,
      },
      windowLayout: options.windowLayout ?? DEFAULT_BUTTERCHURN_WINDOW_LAYOUT,
    });
  }
}

// Bit of a hack here. This overwrites the value set in Webamp.ts and WebampLazy.ts
// @ts-ignore
window.Webamp = Webamp;
