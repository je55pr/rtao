import { describe, expect, it } from "vitest";
import {
  UnsupportedTsqOpcodeError,
  decodePackedTsqRequest,
  encodePackedTsqRequest,
  lookupTsqRequest,
  readTsq,
  readTsqBytecodeToken,
  readTsqMusicDescriptors,
  resolvePackedTsqRequest,
  tokenizeTsqBytecode,
  tsqBoundaryMarker,
} from "./tsq";

function makeTsq(entryCount: 51 | 100, size = 0x300): Uint8Array {
  const boundary = entryCount * 4;
  const bytes = new Uint8Array(Math.max(size, boundary + tsqBoundaryMarker.length + 1));
  const view = new DataView(bytes.buffer);
  const sequenceOffset = boundary + tsqBoundaryMarker.length;
  for (let index = 0; index < entryCount; index += 1) {
    view.setUint16(index * 4, 1, true);
    view.setUint16(index * 4 + 2, sequenceOffset, true);
  }
  bytes.set(tsqBoundaryMarker, boundary);
  bytes[sequenceOffset] = 0xff;
  return bytes;
}

function setEntry(bytes: Uint8Array, index: number, priority: number, sequenceOffset: number): void {
  const view = new DataView(bytes.buffer);
  view.setUint16(index * 4, priority, true);
  view.setUint16(index * 4 + 2, sequenceOffset, true);
}
describe("PAL TSQ directories", () => {
  it("recognizes both recovered directory shapes", () => {
    const small = readTsq(makeTsq(51));
    expect(small.directoryEntryCount).toBe(51);
    expect(small.directoryEnd).toBe(0xcc);
    expect(lookupTsqRequest(small, 50).index).toBe(50);

    const large = readTsq(makeTsq(100));
    expect(large.directoryEntryCount).toBe(100);
    expect(large.directoryEnd).toBe(0x190);
    expect(lookupTsqRequest(large, 99).index).toBe(99);
  });

  it("diagnoses missing, ambiguous, and out-of-range structure", () => {
    expect(() => readTsq(new Uint8Array(0x200))).toThrow(/boundary marker/);

    const ambiguous = makeTsq(100);
    ambiguous.set(tsqBoundaryMarker, 0xcc);
    expect(() => readTsq(ambiguous)).toThrow(/found 2/);

    const badOffset = makeTsq(51);
    setEntry(badOffset, 7, 1, 0xffff);
    expect(() => readTsq(badOffset)).toThrow(/request 7 sequence offset/);
    expect(() => lookupTsqRequest(readTsq(makeTsq(51)), 51)).toThrow(/outside/);
  });
});
describe("PAL TSQ packed requests", () => {
  it("decodes recovered bank/index/cancel fields and upper request parameters", () => {
    expect(decodePackedTsqRequest(40)).toMatchObject({ requestId: 40, parameters: 0, cancel: false, bank: 0, index: 40, reservedBits: 0 });
    expect(decodePackedTsqRequest(0x0302)).toMatchObject({ cancel: false, bank: 3, index: 2, reservedBits: 0 });
    expect(decodePackedTsqRequest(0x8035)).toMatchObject({ cancel: true, bank: 0, index: 0x35, reservedBits: 0 });

    const encoded = encodePackedTsqRequest({ bank: 3, index: 2, cancel: true, parameters: 0xabcd });
    expect(decodePackedTsqRequest(encoded)).toMatchObject({ parameters: 0xabcd, cancel: true, bank: 3, index: 2 });
  });

  it("resolves through an explicit native bank map and diagnoses unsupported request bits", () => {
    const cqMain = readTsq(makeTsq(100));
    const action = readTsq(makeTsq(100));
    const banks = new Map([[0, cqMain], [3, action]]);
    expect(resolvePackedTsqRequest(40, banks).tsq).toBe(cqMain);
    expect(resolvePackedTsqRequest(0x0302, banks).tsq).toBe(action);
    expect(() => resolvePackedTsqRequest(0x1000, banks)).toThrow(/reserved bits/);
    expect(() => resolvePackedTsqRequest(0x0201, banks)).toThrow(/bank 2/);
  });
});
describe("PAL TSQ music descriptors", () => {
  it("preserves the proven 36-channel descriptor structure and relative offsets", () => {
    const bytes = makeTsq(51, 0x300);
    const descriptorOffset = 0xd0;
    setEntry(bytes, 4, 0, descriptorOffset);
    const view = new DataView(bytes.buffer);
    for (let channel = 0; channel < 36; channel += 1) {
      const offset = descriptorOffset + channel * 4;
      bytes[offset] = channel;
      bytes[offset + 1] = 0xa0 + channel;
      view.setUint16(offset + 2, channel * 7, true);
    }

    const descriptors = readTsqMusicDescriptors(readTsq(bytes), 4);
    expect(descriptors).toHaveLength(36);
    expect(descriptors[0]).toEqual({ channelIndex: 0, stateByte: 0, reservedByte: 0xa0, relativeBytecodeOffset: 0 });
    expect(descriptors[35]).toEqual({ channelIndex: 35, stateByte: 35, reservedByte: 0xc3, relativeBytecodeOffset: 245 });
  });

  it("rejects non-music requests and truncated descriptor blocks", () => {
    expect(() => readTsqMusicDescriptors(readTsq(makeTsq(51)), 0)).toThrow(/priority/);
    const bytes = makeTsq(51, 0xd0 + 36 * 4 - 1);
    setEntry(bytes, 2, 0, 0xd0);
    expect(() => readTsqMusicDescriptors(readTsq(bytes), 2)).toThrow(/exceeds/);
  });
});
describe("PAL TSQ bytecode structure", () => {
  it("uses only SNDMOD-proven immediate widths", () => {
    const bytes = new Uint8Array([
      0x05, 0x81,
      0xe0, 0x10, 0xe1, 0x20, 0x21, 0xe2, 0x30, 0xe3, 0x40, 0x41,
      0xe4, 0x50, 0x51, 0xe5, 0x60, 0x61, 0xe6, 0x70, 0xe7, 0x71,
      0xe8, 0xe9, 0xea, 0x80, 0x81, 0xf0, 0xf1, 0x90,
      0xf8, 0xfe, 0xff, 0xf9, 0xa0, 0xa1, 0xff,
    ]);
    const tokens = tokenizeTsqBytecode(bytes, 0);
    expect(tokens.map((token) => token.family)).toEqual([
      "step", "key-on", "volume", "pan", "tone", "tempo", "pitch", "key-pitch",
      "reverb-e6", "reverb-e7", "flag-on", "flag-off", "pitch-cent",
      "key-off", "priority", "jump", "extended-channel", "end",
    ]);
    expect(tokens.map((token) => token.length)).toEqual([1, 1, 2, 3, 2, 3, 3, 3, 2, 2, 1, 1, 3, 1, 2, 3, 3, 1]);
    expect(tokens[0]?.embeddedValue).toBe(5);
    expect(tokens[1]?.embeddedValue).toBe(1);
    expect(tokens[15]?.immediateBytes).toEqual([0xfe, 0xff]);
    expect(tokens[15]?.signedImmediate).toBe(-2);
  });
  it("keeps unsupported opcodes and truncated immediates explicit", () => {
    expect(() => readTsqBytecodeToken(new Uint8Array([0xeb]), 0)).toThrow(UnsupportedTsqOpcodeError);
    expect(() => readTsqBytecodeToken(new Uint8Array([0xe1, 0x10]), 0)).toThrow(/exceeds/);
  });

  it("models the recovered request-40 chain shape without PAL bytecode", () => {
    const bytes = makeTsq(100, 0x300);
    const sequenceOffset = 0x200;
    setEntry(bytes, 40, 7, sequenceOffset);
    bytes.set([0xe9, 0xf0, 0xe0, 0x11, 0xe2, 0x22, 0x91, 0x05, 0xf0, 0xff], sequenceOffset);
    const cqMain = readTsq(bytes);
    const resolved = resolvePackedTsqRequest(40, new Map([[0, cqMain]]));
    const tokens = tokenizeTsqBytecode(cqMain.bytes, resolved.entry.sequenceOffset);
    expect(tokens.map((token) => token.family)).toEqual([
      "flag-off", "key-off", "volume", "tone", "key-on", "step", "key-off", "end",
    ]);
    expect(tokens[2]?.immediateBytes).toEqual([0x11]);
    expect(tokens[3]?.immediateBytes).toEqual([0x22]);
    expect(tokens[4]?.embeddedValue).toBe(0x11);
    expect(tokens[5]?.embeddedValue).toBe(5);
  });
});
