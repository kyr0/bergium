/**
 * ringbuf.js transports samples only; this protocol defines ownership and time.
 * One SPSC ring carries interleaved Float32 PCM. A second SPSC ring carries these
 * fixed-size Int32 metadata records. Producer commits PCM first, then metadata.
 */
export const PCM_META_WORDS = 8;
export interface PcmBlockMeta {
  sequence: number;
  firstSampleFrameLow: number;
  firstSampleFrameHigh: number;
  sampleRate: number;
  frames: number;
  channels: 1 | 2;
  pcmElements: number;
  flags: number; // bit 0: discontinuity, bit 1: dropped-before-this-block
}

export function encodeMeta(m: PcmBlockMeta, out: Int32Array): void {
  out.set([m.sequence, m.firstSampleFrameLow, m.firstSampleFrameHigh, m.sampleRate, m.frames, m.channels, m.pcmElements, m.flags]);
}

export function decodeMeta(a: Int32Array): PcmBlockMeta {
  return { sequence: a[0]!, firstSampleFrameLow: a[1]!, firstSampleFrameHigh: a[2]!, sampleRate: a[3]!, frames: a[4]!, channels: a[5] as 1 | 2, pcmElements: a[6]!, flags: a[7]! };
}

/** Realtime rule: on insufficient capacity drop the whole quantum and flag the next one. */
export interface PcmRingWriter { availableWrite(): number; push(input: Float32Array): number; }
export interface MetaRingWriter { availableWrite(): number; push(input: Int32Array): number; }

export function commitBlock(pcmRing: PcmRingWriter, metaRing: MetaRingWriter, pcm: Float32Array, meta: PcmBlockMeta, scratch: Int32Array): boolean {
  if (pcmRing.availableWrite() < pcm.length || metaRing.availableWrite() < PCM_META_WORDS) return false;
  if (pcmRing.push(pcm) !== pcm.length) return false;
  encodeMeta(meta, scratch);
  return metaRing.push(scratch) === PCM_META_WORDS;
}

