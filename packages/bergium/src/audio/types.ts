export interface BeatEvent {
  strength: number;
  band: "broadband" | "bass" | "mid" | "treble";
}

/** Renderer-neutral, immutable analysis snapshot in audio-clock time. */
export interface AudioFrame {
  timestampSeconds: number;
  sampleRate: number;
  waveformLeft: Float32Array;
  waveformRight: Float32Array;
  spectrumLeft: Float32Array;
  spectrumRight: Float32Array;
  energy: number;
  bass: number;
  mid: number;
  treble: number;
  bassAttenuated: number;
  midAttenuated: number;
  trebleAttenuated: number;
  beats: readonly BeatEvent[];
}

export interface AudioFrameProvider {
  readonly kind: "worklet-sab" | "worklet-message" | "analyser" | "external";
  connect(node: AudioNode): void;
  disconnect(): void;
  sample(timestampSeconds: number): AudioFrame;
  destroy(): void;
}

