/**
 * Ambient declarations for the AudioWorkletGlobalScope globals that the capture
 * processor relies on at runtime. They are provided by the browser inside the
 * worklet realm and are intentionally declared here (not imported) so the
 * capture source stays a literal worklet module while still type-checking under
 * the project's strict settings.
 */
declare abstract class AudioWorkletProcessor {
  protected constructor();
  readonly port: MessagePort;
}

declare function registerProcessor(
  name: string,
  ctor: new () => AudioWorkletProcessor,
): void;

declare const sampleRate: number;
declare const currentFrame: number;
declare const currentTime: number;
