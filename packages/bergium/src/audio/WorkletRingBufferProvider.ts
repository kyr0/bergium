import type { AudioFrame, AudioFrameProvider } from "./types.js";
import { RingBuffer } from "ringbuf.js";
import { PCM_META_WORDS, decodeMeta } from "./ring/PcmRingProtocol.js";
import { ReferencePcmWindow } from "./geiss/ReferencePcmWindow.js";
import { GeissAudioAnalyzer } from "./geiss/GeissAudioAnalyzer.js";

/**
 * Integration boundary for ringbuf.js.
 *
 * Fast path: AudioWorklet -> SharedArrayBuffer ring -> analysis consumer.
 * Fallback: AudioWorklet -> MessagePort feature frames.
 * Never expose ring-buffer mechanics to renderer pipelines.
 */
export class WorkletRingBufferProvider implements AudioFrameProvider {
  public readonly kind = "worklet-sab" as const;
  // explicit `| undefined` keeps exactOptionalPropertyTypes satisfied on destroy()
  private pcm: RingBuffer | undefined;
  private meta: RingBuffer | undefined;
  private node: AudioWorkletNode | undefined;
  private reference: ReferencePcmWindow | undefined;
  private readonly metaScratch = new Int32Array(PCM_META_WORDS);
  private readonly pcmScratch = new Float32Array(128 * 2);
  private readonly geiss = new GeissAudioAnalyzer();
  private lastSequence = -1;

  public constructor(private readonly context: AudioContext, private readonly width: number = 640, private readonly randomInt: (n: number) => number = () => 0) { }

  public connect(source: AudioNode): void {
    // Setup is shown synchronously as an architecture oracle; production awaits addModule.
    const pcmStorage = RingBuffer.getStorageForCapacity(16384, Float32Array);
    const metaStorage = RingBuffer.getStorageForCapacity(PCM_META_WORDS * 128, Int32Array);
    this.pcm = new RingBuffer(pcmStorage, Float32Array); this.meta = new RingBuffer(metaStorage, Int32Array);
    this.reference = new ReferencePcmWindow(this.context.sampleRate);
    this.node = new AudioWorkletNode(this.context, "bergium-capture");
    this.node.port.postMessage({ pcmStorage, metaStorage }); source.connect(this.node); this.node.connect(this.context.destination);
  }

  public disconnect(): void { this.node?.disconnect(); }

  public sample(timestampSeconds: number): AudioFrame {
    if (!this.pcm || !this.meta || !this.reference) throw new Error("Audio provider is not connected");
    while (this.meta.availableRead() >= PCM_META_WORDS) {
      if (this.meta.pop(this.metaScratch, PCM_META_WORDS) !== PCM_META_WORDS) break;
      const m = decodeMeta(this.metaScratch);
      if (m.sequence !== this.lastSequence + 1 && this.lastSequence >= 0) {/* discontinuity is explicit; analyzer retains decay state */ }
      this.lastSequence = m.sequence;
      let remaining = m.pcmElements;
      while (remaining > 0) { const n = Math.min(remaining, this.pcmScratch.length), read = this.pcm.pop(this.pcmScratch, n); if (read !== n) throw new Error("Corrupt PCM/meta commit ordering"); this.reference.pushInterleaved(this.pcmScratch.subarray(0, n), m.channels); remaining -= n; }
    }
    const bytes = this.reference.latestSignedBytes();
    const g = this.geiss.analyze(bytes.left, bytes.right, { width: this.width, fpsAtModeSwitch: 30, displayBits: 8, visMode: "waveform", waveform: 1, useBeatDetection: true, slideShift: true }, this.randomInt);
    // Renderer-neutral arrays remain separate from Geiss's stateful compatibility values.
    return { timestampSeconds, sampleRate: 44_100, waveformLeft: Float32Array.from(bytes.left, v => v / 128), waveformRight: Float32Array.from(bytes.right, v => v / 128), spectrumLeft: g.power.slice(), spectrumRight: g.power.slice(), energy: g.currentVolume, bass: 0, mid: 0, treble: 0, bassAttenuated: 0, midAttenuated: 0, trebleAttenuated: 0, beats: g.bigBeat ? [{ strength: g.beatStrength, band: "broadband" }] : [] };
  }

  public destroy(): void { this.disconnect(); this.node = undefined; this.pcm = undefined; this.meta = undefined; }
}
