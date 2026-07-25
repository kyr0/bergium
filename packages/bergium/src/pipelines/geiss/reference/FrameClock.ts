/**
 * Per-frame time advance for the classic profile (vendor/geiss/main.cpp:5435).
 *
 * `floatframe` is a floating-point clock that drives continuous effect motion
 * (chasers, shade bobs); it advances by `1.6*min(1, 47/fps)` so simulation does
 * NOT speed up on high-FPS displays. `intframe` is a separate integer frame
 * counter (used by `intframe%11` clearframes, solar sin periods, etc.). Keeping
 * simulate() on this fixed clock — independent of present rate — is a core plan
 * invariant.
 */
export interface FrameClock {
  floatframe: number;
  intframe: number;
  framesThisMode: number;
  clearframes: number;
}

export function createFrameClock(): FrameClock {
  // clearframes starts at 4 (matches the source's initial value).
  return { floatframe: 0, intframe: 0, framesThisMode: 0, clearframes: 4 };
}

export function advanceFrameClock(clock: FrameClock, fps: number): void {
  clock.floatframe += 1.6 * Math.min(1, 47 / fps);
  clock.intframe++;
  clock.framesThisMode++;
  if (clock.intframe % 11 === 0) clock.clearframes = 1;
}
