import { describe, expect, it } from "vitest";
import { decodePsAdpcmFrame, readPsAdpcmFrame } from "./psAdpcm";
import { readTvb, transformTvbAdsrWord } from "./tvb";
import { palVagHeaderSize, palVagSampleRate, palVagVersion, readPalVag, readPalVagFrame } from "./vag";

function makeVag(payload: Uint8Array, overrides: { version?: number; rate?: number; declaredSize?: number } = {}): Uint8Array {
  const bytes = new Uint8Array(palVagHeaderSize + payload.length);
  bytes.set(new TextEncoder().encode("VAGp"));
  const view = new DataView(bytes.buffer);
  view.setUint32(0x04, overrides.version ?? palVagVersion, false);
  view.setUint32(0x0c, overrides.declaredSize ?? payload.length, false);
  view.setUint32(0x10, overrides.rate ?? palVagSampleRate, false);
  bytes.set(new TextEncoder().encode("synthetic"), 0x20);
  bytes.set(payload, palVagHeaderSize);
  return bytes;
}

function makeTvb(payloadLength = 64): Uint8Array {
  const bytes = new Uint8Array(0x800 + payloadLength);
  const view = new DataView(bytes.buffer);
  for (let slot = 0; slot < 256; slot += 1) view.setUint32(slot * 4, payloadLength, true);
  view.setUint32(0x000, 0, true);
  view.setUint32(0x004, 0, true);
  view.setUint32(0x008, 32, true);
  view.setUint32(0x400, 0xd2f2e11e, true);
  return bytes;
}
describe("PAL VAG", () => {
  it("reads the PAL header contract and preserves arbitrary frame control bits", () => {
    const frame = new Uint8Array(16);
    frame[0] = 0x0c;
    frame[1] = 0xe3;
    frame[2] = 0x21;
    frame[3] = 0x8f;
    const vag = readPalVag(makeVag(frame));
    expect(vag).toMatchObject({ version: 0x20, sampleRate: 12_000, payloadSize: 16, frameCount: 1, name: "synthetic" });
    expect(readPalVagFrame(vag, 0).control).toBe(0xe3);
  });

  it("decodes low-nibble-first PS-ADPCM without treating control bits as codec parameters", () => {
    const frame = new Uint8Array(16);
    frame[0] = 0x0c;
    frame[1] = 0xff;
    frame[2] = 0x21;
    frame[3] = 0x8f;
    const parsed = readPsAdpcmFrame(frame);
    expect(parsed.control).toBe(0xff);
    expect([...decodePsAdpcmFrame(parsed).samples.slice(0, 4)]).toEqual([1, 2, -1, -8]);
  });

  it("applies the PS-ADPCM predictor history", () => {
    const frame = readPsAdpcmFrame(new Uint8Array([0x1c, 0, ...new Array(14).fill(0)]));
    expect([...decodePsAdpcmFrame(frame, { previous1: 64, previous2: 0 }).samples.slice(0, 2)]).toEqual([60, 56]);
  });
  it("rejects malformed PAL VAG headers and payload relationships", () => {
    const frame = new Uint8Array(16);
    const badMagic = makeVag(frame); badMagic[0] = 0;
    expect(() => readPalVag(badMagic)).toThrow(/VAGp/);
    expect(() => readPalVag(makeVag(frame, { version: 0x21 }))).toThrow(/version/);
    expect(() => readPalVag(makeVag(frame, { rate: 44_100 }))).toThrow(/sample rate/);
    expect(() => readPalVag(makeVag(frame, { declaredSize: 32 }))).toThrow(/declares 32/);
    expect(() => readPalVag(makeVag(new Uint8Array(15)))).toThrow(/multiple of 16/);
  });

  it("rejects frame reads outside the declared payload", () => {
    const vag = readPalVag(makeVag(new Uint8Array(16)));
    expect(() => readPalVagFrame(vag, 1)).toThrow(/outside/);
  });
});

describe("PAL TVB", () => {
  it("parses aliased wave starts, payload-end sentinels, and native ADSR words", () => {
    const bank = readTvb(makeTvb());
    expect(bank.sampleSpans).toHaveLength(2);
    expect(bank.sampleSpans[0]).toMatchObject({ startOffset: 0, endOffset: 32, length: 32, frameCount: 2, slots: [0, 1] });
    expect(bank.sampleSpans[1]).toMatchObject({ startOffset: 32, endOffset: 64, length: 32, frameCount: 2, slots: [2] });
    expect(bank.sampleBySlot[0]).toBe(bank.sampleBySlot[1]);
    expect(bank.sampleBySlot[3]).toBeNull();
    expect(bank.sentinelSlots[0]).toBe(3);
    expect(bank.sentinelSlots.at(-1)).toBe(255);
  });
  it("reproduces the exact SNDMOD load_tvbf ADSR transformation", () => {
    expect(transformTvbAdsrWord(0xd2f2e11e)).toBe(0x0d0d1eee);
    expect(readTvb(makeTvb()).nativeAdsrWords[0]).toBe(0x0d0d1eee);
  });

  it("rejects malformed sample spans without rejecting aliases", () => {
    const outOfRange = makeTvb();
    new DataView(outOfRange.buffer).setUint32(0, 80, true);
    expect(() => readTvb(outOfRange)).toThrow(/past ADPCM payload/);

    const unaligned = makeTvb();
    new DataView(unaligned.buffer).setUint32(8, 31, true);
    expect(() => readTvb(unaligned)).toThrow(/frame-aligned/);

    const decreasing = makeTvb();
    const decreasingView = new DataView(decreasing.buffer);
    decreasingView.setUint32(0, 32, true);
    decreasingView.setUint32(4, 16, true);
    expect(() => readTvb(decreasing)).toThrow(/decrease/);

    expect(() => readTvb(new Uint8Array(0x7ff))).toThrow(/shorter/);
    expect(() => readTvb(new Uint8Array(0x801))).toThrow(/multiple of 16/);
  });
});
