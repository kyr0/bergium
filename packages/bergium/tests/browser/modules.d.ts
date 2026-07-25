// Minimal ambient declarations for the Phase-1 frozen-reference packages (untyped
// JS). These are dev/runtime-injected references only; the library build does not
// import them. Shapes capture just what the freeze test exercises.
declare module "butterchurn" {
  const Butterchurn: {
    createVisualizer(
      ctx: AudioContext,
      canvas: HTMLCanvasElement,
      opts: { width: number; height: number },
    ): {
      loadPreset(preset: unknown, transitionSeconds: number): void;
      connectAudio(node: AudioNode): void;
      setRendererSize(width: number, height: number): void;
      launchSongTitleAnim(title: string): void;
      render(): void;
    };
  };
  export default Butterchurn;
}

// butterchurn-presets is a UMD bundle; access getPresets() defensively (see test).
declare module "butterchurn-presets";
