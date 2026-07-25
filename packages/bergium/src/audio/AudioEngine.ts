import type { AudioFrame, AudioFrameProvider } from "./types.js";

/** Selects transport; normalizes every path into equivalent AudioFrame values. */
export class AudioEngine {
  public constructor(private readonly provider: AudioFrameProvider) { }

  public connect(node: AudioNode): void {
    this.provider.connect(node);
  }

  public disconnect(): void {
    this.provider.disconnect();
  }

  public sample(timestampSeconds: number): AudioFrame {
    return this.provider.sample(timestampSeconds);
  }

  public destroy(): void {
    this.provider.destroy();
  }
}

