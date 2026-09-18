import { describe, expect, it } from "vitest";
import { palVagHeaderSize, palVagSampleRate, palVagVersion } from "../formats/vag";
import { decodePalVagClip, decodePalVagStereo, decodeTvbSlotClip } from "./pcm";

function makeVag(payload: Uint8Array): Uint8Array {
  const bytes = new Uint8Array(palVagHeaderSize + payload.length);
  bytes.set(new TextEncoder().encode("VAGp"));
  const view = new DataView(bytes.buffer);
  view.setUint32(0x04, palVagVersion, false);
  view.setUint32(0x0c, payload.length, false);
  view.setUint32(0x10, palVagSampleRate, false);
  bytes.set(payload, palVagHeaderSize);
  return bytes;
}

function frame(firstPackedByte: number): Uint8Array {
  const bytes = new Uint8Array(16);
  bytes[0] = 0x0c;
  bytes[2] = firstPackedByte;
  return bytes;
}

function makeTvb(): Uint8Array {
  const bytes = new Uint8Array(0x800 + 32);
  const view = new DataView(bytes.buffer);
  for (let slot = 0; slot < 256; slot += 1) view.setUint32(slot * 4, 32, true);
  view.setUint32(0, 0, true);
  view.setUint32(4, 16, true);
  bytes.set(frame(0x21), 0x800);
  bytes.set(frame(0x43), 0x810);
  return bytes;
}

describe("PCM game-audio bridge", () => {
  it("decodes a PAL VAG channel to normalized PCM without browser dependencies", () => {
    const clip = decodePalVagClip(makeVag(frame(0x21)));
    expect(clip.sampleRate).toBe(12_000);
    expect(clip.frameCount).toBe(28);
    expect(clip.channels).toHaveLength(1);
    expect(Array.from(clip.channels[0]!.slice(0, 4))).toEqual([
      1 / 0x8000,
      2 / 0x8000,
      0,
      0,
    ]);
  });
  it("pairs equal PAL VAG channels into one stereo clip", () => {
    const clip = decodePalVagStereo(makeVag(frame(0x21)), makeVag(frame(0x43)));
    expect(clip.sampleRate).toBe(12_000);
    expect(clip.frameCount).toBe(28);
    expect(clip.channels).toHaveLength(2);
    expect(clip.channels[0]![0]).toBe(1 / 0x8000);
    expect(clip.channels[1]![0]).toBe(3 / 0x8000);
  });

  it("requires matched stream lengths rather than silently truncating stereo", () => {
    const twoFrames = new Uint8Array(32);
    twoFrames.set(frame(0x21));
    twoFrames.set(frame(0x21), 16);
    expect(() => decodePalVagStereo(makeVag(frame(0x21)), makeVag(twoFrames))).toThrow(/frame counts differ/);
  });
  it("decodes a TVB sample only when the caller supplies its external sample rate", () => {
    const clip = decodeTvbSlotClip(makeTvb(), 1, 22_050);
    expect(clip.sampleRate).toBe(22_050);
    expect(clip.frameCount).toBe(28);
    expect(clip.channels[0]![0]).toBe(3 / 0x8000);
  });

  it("rejects TVB sentinel slots and invalid externally supplied rates", () => {
    expect(() => decodeTvbSlotClip(makeTvb(), 2, 22_050)).toThrow(/sentinel/);
    expect(() => decodeTvbSlotClip(makeTvb(), 0, 0)).toThrow(/sample rate/);
  });
});
