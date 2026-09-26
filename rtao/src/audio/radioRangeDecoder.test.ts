import { describe, expect, it } from "vitest";
import { buildRadioVagCheckpointIndex } from "./radioVagCheckpoints";
import { RadioRangeDecoder } from "./radioRangeDecoder";
import { readPalVag } from "../formats/vag";
import { decodePsAdpcm } from "../formats/psAdpcm";

function makeVag(frames: number): Uint8Array {
  const bytes = new Uint8Array(0x30 + frames * 16);
  bytes.set(new TextEncoder().encode("VAGp"), 0);
  const view = new DataView(bytes.buffer);
  view.setUint32(0x04, 0x20, false);
  view.setUint32(0x0c, frames * 16, false);
  view.setUint32(0x10, 12_000, false);
  for (let frame = 0; frame < frames; frame += 1) {
    const offset = 0x30 + frame * 16;
    bytes[offset] = 0x10;
    for (let byte = 2; byte < 16; byte += 1) bytes[offset + byte] = (frame * 17 + byte) & 0xff;
  }
  return bytes;
}

describe("RadioRangeDecoder", () => {
  it("matches whole-payload decoding while reading only checkpoint-bounded frames", async () => {
    const bytes = makeVag(20);
    const index = buildRadioVagCheckpointIndex(bytes, 4);
    const reads: Array<[number, number]> = [];
    const decoder = new RadioRangeDecoder(index, async (offset, length) => {
      reads.push([offset, length]);
      return bytes.slice(offset, offset + length);
    });
    const sampleOffset = 9 * 28 + 7;
    const sampleCount = 70;
    const actual = await decoder.readFloat32(sampleOffset, sampleCount);
    const expectedPcm = decodePsAdpcm(readPalVag(bytes).payload);
    const expected = Float32Array.from(
      expectedPcm.slice(sampleOffset, sampleOffset + sampleCount),
      (sample) => sample / 0x8000,
    );
    expect(actual).toEqual(expected);
    expect(reads).toEqual([[0x30 + 8 * 16, 4 * 16]]);
  });
});
