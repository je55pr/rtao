import { BinaryView } from "../core/binary";
import { psAdpcmFrameSize } from "./psAdpcm";

export const tvbWaveCount = 256;
export const tvbWaveTableOffset = 0x000;
export const tvbAdsrTableOffset = 0x400;
export const tvbAdpcmOffset = 0x800;

export interface TvbSampleSpan {
  readonly startOffset: number;
  readonly endOffset: number;
  readonly length: number;
  readonly frameCount: number;
  readonly slots: readonly number[];
  readonly adpcm: Uint8Array;
}

export interface TvbBank {
  readonly waveOffsets: readonly number[];
  readonly adsrWords: readonly number[];
  readonly nativeAdsrWords: readonly number[];
  readonly adpcm: Uint8Array;
  readonly sampleSpans: readonly TvbSampleSpan[];
  readonly sampleBySlot: readonly (TvbSampleSpan | null)[];
  readonly sentinelSlots: readonly number[];
}

/** Exact transform in SNDMOD.IRX load_tvbf 0x58C4..0x58E4. */
export function transformTvbAdsrWord(word: number): number {
  const raw = word >>> 0;
  return ((((~raw) >>> 0) & 0xdffffff0) | (raw & 0x0f)) >>> 0;
}
export function readTvb(bytes: Uint8Array): TvbBank {
  const data = new BinaryView(bytes);
  if (data.length < tvbAdpcmOffset) throw new Error("TVB file is shorter than its 0x800-byte tables.");
  const adpcmLength = data.length - tvbAdpcmOffset;
  if (adpcmLength % psAdpcmFrameSize !== 0) {
    throw new Error(`TVB ADPCM payload length ${adpcmLength} is not a multiple of ${psAdpcmFrameSize}.`);
  }

  const waveOffsets = Array.from({ length: tvbWaveCount }, (_, slot) => data.u32(tvbWaveTableOffset + slot * 4));
  for (let slot = 0; slot < waveOffsets.length; slot += 1) {
    const offset = waveOffsets[slot]!;
    if (offset > adpcmLength) throw new Error(`TVB wave slot ${slot} points past ADPCM payload: ${offset} > ${adpcmLength}.`);
    if (offset % psAdpcmFrameSize !== 0) throw new Error(`TVB wave slot ${slot} offset ${offset} is not frame-aligned.`);
    if (slot > 0 && offset < waveOffsets[slot - 1]!) {
      throw new Error(`TVB wave offsets decrease at slot ${slot}: ${offset} < ${waveOffsets[slot - 1]}.`);
    }
  }

  const adsrWords = Array.from({ length: tvbWaveCount }, (_, slot) => data.u32(tvbAdsrTableOffset + slot * 4));
  const nativeAdsrWords = adsrWords.map(transformTvbAdsrWord);
  const adpcm = data.span(tvbAdpcmOffset, adpcmLength);
  const sentinelSlots = waveOffsets.flatMap((offset, slot) => offset === adpcmLength ? [slot] : []);
  const starts = [...new Set(waveOffsets.filter((offset) => offset < adpcmLength))];
  const spanByStart = new Map<number, TvbSampleSpan>();
  const sampleSpans = starts.map((startOffset, index) => {
    const endOffset = starts[index + 1] ?? adpcmLength;
    const slots = waveOffsets.flatMap((offset, slot) => offset === startOffset ? [slot] : []);
    const span: TvbSampleSpan = {
      startOffset,
      endOffset,
      length: endOffset - startOffset,
      frameCount: (endOffset - startOffset) / psAdpcmFrameSize,
      slots,
      adpcm: adpcm.subarray(startOffset, endOffset),
    };
    spanByStart.set(startOffset, span);
    return span;
  });
  const sampleBySlot = waveOffsets.map((offset) => offset === adpcmLength ? null : (spanByStart.get(offset) ?? null));

  return {
    waveOffsets,
    adsrWords,
    nativeAdsrWords,
    adpcm,
    sampleSpans,
    sampleBySlot,
    sentinelSlots,
  };
}
