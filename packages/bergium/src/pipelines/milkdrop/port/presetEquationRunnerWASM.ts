import PresetEquationRunner, {
  type ButterchurnPreset,
  type GlobalVars,
  type RunnerOpts,
} from "./presetEquationRunner.js";
import Utils from "./Utils.js";

/**
 * PresetEquationRunnerWASM — Phase-8 SEAM (typed surface only).
 *
 * The WASM/EEL evaluator is a frozen `eel-wasm` asset (plan non-goal: do not
 * reimplement). This class provides the typed public surface the Renderer's
 * `useWASM` branch references (notably `globalKeys`/`frameKeys`/`waveFrameKeys`),
 * so that branch is preserved verbatim and type-checks. It extends the JS runner
 * so it is assignable where the Renderer types `presetEquationRunner`, and
 * overrides `initializeEquations` as a no-op seam: it is constructed ONLY when a
 * preset carries `useWASM === true`, which the in-tree JS path never sets. Full
 * WASM wiring lands in Phase 8.
 *
 * The key arrays below are copied verbatim from the vendored
 * vendor/butterchurn/src/equations/presetEquationRunnerWASM.js (pinned revision fbac2f6).
 */
export default class PresetEquationRunnerWASM extends PresetEquationRunner {
  public globalKeys: string[];
  public frameKeys: string[];
  public waveFrameKeys: string[];
  public waveFrameInputKeys: string[];

  public constructor(preset: ButterchurnPreset, globalVars: GlobalVars, opts: RunnerOpts) {
    super(preset, globalVars, opts);

    this.globalKeys = [
      "frame",
      "time",
      "fps",
      "bass",
      "bass_att",
      "mid",
      "mid_att",
      "treb",
      "treb_att",
      "meshx",
      "meshy",
      "aspectx",
      "aspecty",
      "pixelsx",
      "pixelsy",
    ];

    this.frameKeys = [
      "decay",
      "wave_a",
      "wave_r",
      "wave_g",
      "wave_b",
      "wave_x",
      "wave_y",
      "wave_scale",
      "wave_smoothing",
      "wave_mode",
      "old_wave_mode",
      "wave_mystery",
      "ob_size",
      "ob_r",
      "ob_g",
      "ob_b",
      "ob_a",
      "ib_size",
      "ib_r",
      "ib_g",
      "ib_b",
      "ib_a",
      "mv_x",
      "mv_y",
      "mv_dx",
      "mv_dy",
      "mv_l",
      "mv_r",
      "mv_g",
      "mv_b",
      "mv_a",
      "echo_zoom",
      "echo_alpha",
      "echo_orient",
      "wave_dots",
      "wave_thick",
      "additivewave",
      "wave_brighten",
      "modwavealphabyvolume",
      "modwavealphastart",
      "modwavealphaend",
      "darken_center",
      "gammaadj",
      "warp",
      "warpanimspeed",
      "warpscale",
      "zoom",
      "zoomexp",
      "rot",
      "cx",
      "cy",
      "dx",
      "dy",
      "sx",
      "sy",
      "fshader",
      "wrap",
      "invert",
      "brighten",
      "darken",
      "solarize",
      "bmotionvectorson",
      "b1n",
      "b2n",
      "b3n",
      "b1x",
      "b2x",
      "b3x",
      "b1ed",
    ];

    this.waveFrameKeys = [
      "samples",
      "sep",
      "scaling",
      "spectrum",
      "smoothing",
      "r",
      "g",
      "b",
      "a",
    ];

    this.waveFrameInputKeys = ["samples", "r", "g", "b", "a"];

    // Suppress "declared but never read" for the inherited helper in this seam.
    void Utils;
  }

  /** Phase-8 seam: WASM EEL evaluation is the frozen asset (not yet wired). */
  public override initializeEquations(_globalVars: GlobalVars): void {
    // Intentional no-op. See class doc.
  }
}
