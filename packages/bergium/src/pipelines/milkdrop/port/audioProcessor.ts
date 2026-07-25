import FFT from "./fft.js";

/**
 * AudioProcessor - captures/converts the Web Audio window into Butterchurn's
 * signed-byte + spectrum arrays.
 *
 * Mechanical TypeScript port of vendor/butterchurn/src/audio/audioProcessor.js
 * (pinned revision fbac2f6). The analyser graph is browser-only, but
 * `updateAudio(bytes, L, R)` + `processAudio()` are pure and are the seam where
 * the ringbuf.js AudioWorklet capture (Phase 3) feeds Butterchurn's analyser:
 * the worklet's signed bytes are pushed in here, exactly as the AnalyserNode
 * would have produced.
 */
export default class AudioProcessor {
  public numSamp = 512;
  public fftSize: number;
  public fft: FFT;

  public audioContext: AudioContext | undefined;
  public audible: DelayNode | undefined;
  public analyser: AnalyserNode | undefined;
  public analyserL: AnalyserNode | undefined;
  public analyserR: AnalyserNode | undefined;
  public splitter: ChannelSplitterNode | undefined;

  public timeByteArray: Uint8Array<ArrayBuffer>;
  public timeByteArrayL: Uint8Array<ArrayBuffer>;
  public timeByteArrayR: Uint8Array<ArrayBuffer>;
  public timeArray: Int8Array;
  public timeByteArraySignedL: Int8Array;
  public timeByteArraySignedR: Int8Array;
  public tempTimeArrayL: Int8Array;
  public tempTimeArrayR: Int8Array;
  public timeArrayL: Int8Array;
  public timeArrayR: Int8Array;
  public freqArray: Float32Array | undefined;
  public freqArrayL: Float32Array | undefined;
  public freqArrayR: Float32Array | undefined;

  public constructor(context?: AudioContext) {
    this.numSamp = 512;
    this.fftSize = this.numSamp * 2;
    this.fft = new FFT(this.fftSize, 512, true);

    if (context) {
      this.audioContext = context;
      this.audible = context.createDelay();

      this.analyser = context.createAnalyser();
      this.analyser.smoothingTimeConstant = 0.0;
      this.analyser.fftSize = this.fftSize;
      this.audible.connect(this.analyser);

      this.analyserL = context.createAnalyser();
      this.analyserL.smoothingTimeConstant = 0.0;
      this.analyserL.fftSize = this.fftSize;

      this.analyserR = context.createAnalyser();
      this.analyserR.smoothingTimeConstant = 0.0;
      this.analyserR.fftSize = this.fftSize;

      this.splitter = context.createChannelSplitter(2);
      this.audible.connect(this.splitter);
      this.splitter.connect(this.analyserL, 0);
      this.splitter.connect(this.analyserR, 1);
    }

    this.timeByteArray = new Uint8Array(this.fftSize);
    this.timeByteArrayL = new Uint8Array(this.fftSize);
    this.timeByteArrayR = new Uint8Array(this.fftSize);

    this.timeArray = new Int8Array(this.fftSize);
    this.timeByteArraySignedL = new Int8Array(this.fftSize);
    this.timeByteArraySignedR = new Int8Array(this.fftSize);

    this.tempTimeArrayL = new Int8Array(this.fftSize);
    this.tempTimeArrayR = new Int8Array(this.fftSize);

    this.timeArrayL = new Int8Array(this.numSamp);
    this.timeArrayR = new Int8Array(this.numSamp);
  }

  public sampleAudio(): void {
    this.analyser!.getByteTimeDomainData(this.timeByteArray);
    this.analyserL!.getByteTimeDomainData(this.timeByteArrayL);
    this.analyserR!.getByteTimeDomainData(this.timeByteArrayR);
    this.processAudio();
  }

  public updateAudio(timeByteArray: Uint8Array<ArrayBuffer>, timeByteArrayL: Uint8Array<ArrayBuffer>, timeByteArrayR: Uint8Array<ArrayBuffer>): void {
    this.timeByteArray.set(timeByteArray);
    this.timeByteArrayL.set(timeByteArrayL);
    this.timeByteArrayR.set(timeByteArrayR);
    this.processAudio();
  }

  public processAudio(): void {
    for (let i = 0, j = 0, lastIdx = 0; i < this.fftSize; i++) {
      this.timeArray[i] = this.timeByteArray[i]! - 128;
      this.timeByteArraySignedL[i] = this.timeByteArrayL[i]! - 128;
      this.timeByteArraySignedR[i] = this.timeByteArrayR[i]! - 128;

      this.tempTimeArrayL[i] = 0.5 * (this.timeByteArraySignedL[i]! + this.timeByteArraySignedL[lastIdx]!);
      this.tempTimeArrayR[i] = 0.5 * (this.timeByteArraySignedR[i]! + this.timeByteArraySignedR[lastIdx]!);

      if (i % 2 === 0) {
        this.timeArrayL[j] = this.tempTimeArrayL[i]!;
        this.timeArrayR[j] = this.tempTimeArrayR[i]!;
        j += 1;
      }

      lastIdx = i;
    }

    this.freqArray = this.fft.timeToFrequencyDomain(this.timeArray);
    this.freqArrayL = this.fft.timeToFrequencyDomain(this.timeByteArraySignedL);
    this.freqArrayR = this.fft.timeToFrequencyDomain(this.timeByteArraySignedR);
  }

  public connectAudio(audionode: AudioNode): void {
    audionode.connect(this.audible!);
  }

  public disconnectAudio(audionode: AudioNode): void {
    audionode.disconnect(this.audible!);
  }
}
