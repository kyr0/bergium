import { RingBuffer } from "ringbuf.js";
import { PCM_META_WORDS, commitBlock } from "../audio/ring/PcmRingProtocol.js";

interface InitMessage { pcmStorage: SharedArrayBuffer; metaStorage: SharedArrayBuffer; }

/** Capture only. Resampling, byte quantization, FFT and beat logic stay off-thread. */
class BergiumCaptureProcessor extends AudioWorkletProcessor {
  private pcm?: RingBuffer; private meta?: RingBuffer;
  private readonly interleaved = new Float32Array(128 * 2);
  private readonly metaScratch = new Int32Array(PCM_META_WORDS);
  private sequence = 0; private sampleFrame = 0; private dropped = false;

  public constructor() { super(); this.port.onmessage = (e: MessageEvent<InitMessage>) => { this.pcm = new RingBuffer(e.data.pcmStorage, Float32Array); this.meta = new RingBuffer(e.data.metaStorage, Int32Array); }; }

  public process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const input = inputs[0], left = input?.[0], right = input?.[1] ?? left, output = outputs[0];
    if (left && right) {
      for (let i = 0; i < left.length; i++) { this.interleaved[i * 2] = left[i]!; this.interleaved[i * 2 + 1] = right[i]!; }
      if (this.pcm && this.meta) {
        const ok = commitBlock(this.pcm, this.meta, this.interleaved, { sequence: this.sequence++, firstSampleFrameLow: this.sampleFrame >>> 0, firstSampleFrameHigh: Math.floor(this.sampleFrame / 0x1_0000_0000), sampleRate, frames: left.length, channels: 2, pcmElements: left.length * 2, flags: (this.dropped ? 2 : 0) }, this.metaScratch);
        this.dropped = !ok;
      }
      this.sampleFrame += left.length;
      // Transparent node: copy input to output without allocating.
      for (let c = 0; c < (output?.length ?? 0); c++)output![c]!.set(input?.[c] ?? left);
    }
    return true;
  }
}

registerProcessor("bergium-capture", BergiumCaptureProcessor);
