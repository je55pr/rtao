import { describe, expect, it } from "vitest";
import { readTsq, readTsqBytecodeToken, tsqBoundaryMarker } from "../formats/tsq";
import {
  NativeTsqSequencer,
  nativeTsqStepUpdates,
  resolveTsqJumpTarget,
  resolveTsqMusicChannelPrograms,
  type NativeTsqSequencerEvent,
} from "./nativeTsqSequencer";

function makeMusicTsq(): Uint8Array {
  const bytes = new Uint8Array(0x400);
  const view = new DataView(bytes.buffer);
  const descriptorOffset = 0xd0;
  for (let index = 0; index < 51; index += 1) {
    view.setUint16(index * 4, 1, true);
    view.setUint16(index * 4 + 2, 0x300, true);
  }
  bytes.set(tsqBoundaryMarker, 0xcc);
  view.setUint16(4, 0, true);
  view.setUint16(6, descriptorOffset, true);
  for (let channel = 0; channel < 36; channel += 1) {
    const offset = descriptorOffset + channel * 4;
    bytes[offset] = channel;
    bytes[offset + 1] = 0xa0 + channel;
    view.setUint16(offset + 2, 0x90 + channel, true);
  }
  bytes[0x300] = 0xff;
  return bytes;
}
describe("NativeTsqSequencer timing", () => {
  it("keeps step delay in integer TSQ time and dispatches only due voice controls", () => {
    const bytes = new Uint8Array([0xe2, 0x05, 0x81, 0x03, 0xf0, 0xff]);
    const dispatched: NativeTsqSequencerEvent[] = [];
    const sequencer = new NativeTsqSequencer(
      bytes,
      [{ channelIndex: 2, startOffset: 0 }],
      { host: { dispatch: (event) => dispatched.push(event) } },
    );

    const atZero = sequencer.advanceTo(0);
    expect(atZero.map((event) => [event.tick, event.token.family])).toEqual([
      [0, "tone"],
      [0, "key-on"],
    ]);
    expect(sequencer.snapshot().channels[0]).toMatchObject({
      programCounter: 4,
      nextTick: 3,
      ended: false,
    });

    expect(sequencer.advanceTo(2)).toEqual([]);
    expect(sequencer.advanceTo(3).map((event) => event.token.family)).toEqual(["key-off"]);
    expect(sequencer.snapshot().channels[0]).toMatchObject({ nextTick: 3, ended: true });
    expect(dispatched.map((event) => event.token.family)).toEqual(["tone", "key-on", "key-off"]);
  });
  it("consumes PAL E3 without changing timing or dispatching a voice control", () => {
    const bytes = new Uint8Array([0xe3, 0x34, 0x12, 0x02, 0xe2, 0x07, 0xff]);
    const sequencer = new NativeTsqSequencer(bytes, [{ channelIndex: 0, startOffset: 0 }]);

    expect(sequencer.advanceTo(0)).toEqual([]);
    expect(sequencer.snapshot().channels[0]).toMatchObject({ programCounter: 4, nextTick: 2 });
    expect(sequencer.advanceTo(1)).toEqual([]);
    expect(sequencer.advanceTo(2).map((event) => event.token.family)).toEqual(["tone"]);
  });

  it("maps step byte zero to the PAL 16-bit countdown wrap of 65,536 updates", () => {
    const bytes = new Uint8Array([0x00, 0x81, 0xff]);
    const sequencer = new NativeTsqSequencer(bytes, [{ channelIndex: 0, startOffset: 0 }]);

    expect(nativeTsqStepUpdates(readTsqBytecodeToken(bytes, 0))).toBe(0x10000);
    expect(sequencer.advanceTo(0)).toEqual([]);
    expect(sequencer.snapshot().channels[0]).toMatchObject({ programCounter: 1, nextTick: 0x10000 });
    expect(sequencer.advanceTo(0xffff)).toEqual([]);
    expect(sequencer.advanceTo(0x10000).map((event) => event.token.family)).toEqual(["key-on"]);
  });

  it("follows each channel's backward F8 loop independently", () => {
    const bytes = new Uint8Array([
      0x81, 0x02, 0xf0, 0xf8, 0xfa, 0xff, 0xff, 0xff,
      0x82, 0x03, 0xf8, 0xfb, 0xff,
    ]);
    const sequencer = new NativeTsqSequencer(bytes, [
      { channelIndex: 0, startOffset: 0 },
      { channelIndex: 1, startOffset: 8 },
    ]);

    const events = sequencer.advanceTo(6).map((event) => [
      event.tick,
      event.channelIndex,
      event.token.family,
    ]);
    expect(events).toEqual([
      [0, 0, "key-on"],
      [0, 1, "key-on"],
      [2, 0, "key-off"],
      [2, 0, "key-on"],
      [3, 1, "key-on"],
      [4, 0, "key-off"],
      [4, 0, "key-on"],
      [6, 0, "key-off"],
      [6, 0, "key-on"],
      [6, 1, "key-on"],
    ]);
    expect(sequencer.snapshot().channels.map((channel) => channel.jumpCount)).toEqual([3, 2]);
  });

  it("resets channel clocks and loop state deterministically", () => {
    const bytes = new Uint8Array([0x81, 0x02, 0xf0, 0xff]);
    const sequencer = new NativeTsqSequencer(bytes, [{ channelIndex: 7, startOffset: 0 }]);
    sequencer.advanceTo(2);
    expect(sequencer.snapshot()).toMatchObject({ tick: 2 });
    expect(sequencer.snapshot().channels[0]).toMatchObject({ ended: true });

    sequencer.reset();
    expect(sequencer.snapshot()).toMatchObject({ tick: 0 });
    expect(sequencer.snapshot().channels[0]).toMatchObject({
      programCounter: 0,
      nextTick: 0,
      ended: false,
      jumpCount: 0,
    });
    expect(sequencer.advanceTo(0).map((event) => event.token.family)).toEqual(["key-on"]);
  });
});
describe("NativeTsqSequencer control-flow safety", () => {
  it("uses the post-immediate PC as the signed F8 displacement base", () => {
    const token = readTsqBytecodeToken(new Uint8Array([0xf8, 0xfd, 0xff]), 0);
    expect(resolveTsqJumpTarget(token)).toBe(0);
  });

  it("rejects zero-time cycles and out-of-range branches", () => {
    const loop = new NativeTsqSequencer(
      new Uint8Array([0xf8, 0xfd, 0xff]),
      [{ channelIndex: 0, startOffset: 0 }],
      { maxInstructionsPerTick: 8 },
    );
    expect(() => loop.advanceTo(0)).toThrow(/exceeded 8 instructions/);

    const outside = new NativeTsqSequencer(
      new Uint8Array([0xf8, 0x00, 0x00]),
      [{ channelIndex: 0, startOffset: 0 }],
    );
    expect(() => outside.advanceTo(0)).toThrow(/outside 3 bytes/);
  });

  it("rejects duplicate channels, invalid starts, and backward time", () => {
    const bytes = new Uint8Array([0xff]);
    expect(() => new NativeTsqSequencer(bytes, [
      { channelIndex: 0, startOffset: 0 },
      { channelIndex: 0, startOffset: 0 },
    ])).toThrow(/configured more than once/);
    expect(() => new NativeTsqSequencer(bytes, [{ channelIndex: 0, startOffset: 1 }]))
      .toThrow(/outside 1 bytes/);

    const sequencer = new NativeTsqSequencer(bytes, [{ channelIndex: 0, startOffset: 0 }]);
    sequencer.advanceTo(3);
    expect(() => sequencer.advanceTo(2)).toThrow(/cannot move backward/);
  });
});

describe("TSQ music channel programs", () => {
  it("preserves all raw descriptor state while resolving relative channel PCs", () => {
    const tsq = readTsq(makeMusicTsq());
    const programs = resolveTsqMusicChannelPrograms(tsq, 1);
    expect(programs).toHaveLength(36);
    expect(programs[0]).toEqual({
      channelIndex: 0,
      startOffset: 0x160,
      descriptor: {
        channelIndex: 0,
        stateByte: 0,
        reservedByte: 0xa0,
        relativeBytecodeOffset: 0x90,
      },
    });
    expect(programs[35]?.startOffset).toBe(0x160 + 35);
  });
});
