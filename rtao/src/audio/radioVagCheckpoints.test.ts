import { describe, expect, it } from "vitest";
import { buildRadioVagCheckpointIndex, radioVagReplayRange } from "./radioVagCheckpoints";

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
    bytes[offset + 2] = frame & 0xff;
  }
  return bytes;
}

describe("radio VAG predictor checkpoints", () => {
  it("records predictor state before each stride boundary and bounds seek replay", () => {
    const index = buildRadioVagCheckpointIndex(makeVag(10), 4);
    expect(index.checkpoints.map((checkpoint) => checkpoint.frameIndex)).toEqual([0, 4, 8]);
    expect(index.checkpoints[1]).not.toMatchObject({ previous1: 0, previous2: 0 });
    expect(radioVagReplayRange(index, 7)).toMatchObject({
      checkpoint: { frameIndex: 4 },
      fileOffset: 0x30 + 4 * 16,
      frameCount: 4,
    });
  });
});
