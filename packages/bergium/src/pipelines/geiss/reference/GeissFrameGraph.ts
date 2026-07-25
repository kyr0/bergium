import type { IntensityFrame } from "./FeedbackWarp.js";

export interface ClassicEffects {
  shade(frame: IntensityFrame): void; chasers(frame: IntensityFrame): void; bar(frame: IntensityFrame): void;
  dots(frame: IntensityFrame): void; nuclide(frame: IntensityFrame): void; grid(frame: IntensityFrame): void;
  solar(frame: IntensityFrame): void; diminishCenter(frame: IntensityFrame): void;
  audioNuclide(frame: IntensityFrame): void; waveform(frame: IntensityFrame): void;
}
export interface WarpPass { execute(source: IntensityFrame, destination: IntensityFrame): void; }

/** Normative pass scheduler. Effects decide whether their selected flag is active. */
export class GeissFrameGraph {
  public constructor(private front: IntensityFrame, private back: IntensityFrame, private readonly effects: ClassicEffects, private readonly warp: WarpPass) { }
  public step(): IntensityFrame {
    this.effects.shade(this.front); this.effects.chasers(this.front); this.effects.bar(this.front);
    this.effects.dots(this.front); this.effects.nuclide(this.front); this.effects.grid(this.front);
    this.effects.solar(this.front); this.effects.diminishCenter(this.front);
    this.warp.execute(this.front, this.back);
    this.effects.audioNuclide(this.back); this.effects.waveform(this.back);
    [this.front, this.back] = [this.back, this.front]; return this.front;
  }
}

