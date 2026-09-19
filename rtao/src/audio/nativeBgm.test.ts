import { describe, expect, it } from "vitest";
import {
  initialBgmStart,
  nativeFadeCommand,
  nativeMuteCommand,
  ordinaryRaceBgmSetup,
  palMusicFadeAudioUpdates,
  palOrdinaryRaceMusicStartUpdate,
  resolveCommonSceneBgm,
  resolveFixedRoomBgm,
  resolveNativeBgmScene,
  resolveQFactoryBgm,
  resolveRoomBgm,
  transitionBgmTo,
} from "./nativeBgm";

describe("PAL native BGM selection", () => {
  it("maps the recovered common scene selectors to their native BGM TSQ", () => {
    const expected = new Map<number, string>([
      [0, "BGM_01.TSQ"], [1, "BGM_01.TSQ"],
      [2, "BGM_08.TSQ"], [3, "BGM_08.TSQ"],
      [4, "BGM_05.TSQ"], [5, "BGM_05.TSQ"],
      [6, "BGM_07.TSQ"], [11, "BGM_07.TSQ"],
      [7, "BGM_09.TSQ"], [12, "BGM_09.TSQ"],
      [8, "BGM_06.TSQ"], [9, "BGM_06.TSQ"], [10, "BGM_06.TSQ"],
      [13, "BGM_04.TSQ"], [14, "BGM_04.TSQ"],
      [15, "BGM_10.TSQ"], [16, "BGM_10.TSQ"],
      [17, "BGM_03.TSQ"], [26, "BGM_12.TSQ"], [28, "BGM_11.TSQ"],
    ]);
    for (const [selector, tsqFile] of expected) {
      expect(resolveCommonSceneBgm(selector)).toEqual({ tsqFile, sequenceIndex: 1 });
    }
  });

  it("uses BGM_02 for other common selector values rather than an area-name mapping", () => {
    expect(resolveCommonSceneBgm(18)).toEqual({ tsqFile: "BGM_02.TSQ", sequenceIndex: 1 });
    expect(resolveCommonSceneBgm(255)).toEqual({ tsqFile: "BGM_02.TSQ", sequenceIndex: 1 });
    expect(() => resolveCommonSceneBgm(-1)).toThrow(RangeError);
    expect(() => resolveCommonSceneBgm(256)).toThrow(RangeError);
  });

  it("pins Q's Factory to recovered ROOM_1 sequence 1 while retaining the bounded room range", () => {
    expect(resolveQFactoryBgm()).toEqual({ tsqFile: "ROOM_1.TSQ", sequenceIndex: 1 });
    for (let sequence = 1; sequence <= 4; sequence += 1) {
      expect(resolveRoomBgm(sequence)).toEqual({ tsqFile: "ROOM_1.TSQ", sequenceIndex: sequence });
    }
    expect(() => resolveRoomBgm(0)).toThrow(RangeError);
    expect(() => resolveRoomBgm(5)).toThrow(RangeError);
  });

  it("maps fixed-room numeric context without deriving music from room names", () => {
    expect(resolveFixedRoomBgm(1, 0)).toEqual({ tsqFile: "ROOM_1.TSQ", sequenceIndex: 1 });
    expect(resolveFixedRoomBgm(9, 0)).toEqual({ tsqFile: "ROOM_1.TSQ", sequenceIndex: 1 });
    expect(resolveFixedRoomBgm(1, 1)).toEqual({ tsqFile: "ROOM_1.TSQ", sequenceIndex: 3 });
    expect(resolveFixedRoomBgm(9, 7)).toEqual({ tsqFile: "ROOM_1.TSQ", sequenceIndex: 3 });
    expect(resolveFixedRoomBgm(4, 1)).toEqual({ tsqFile: "ROOM_1.TSQ", sequenceIndex: 2 });
    expect(resolveFixedRoomBgm(8, 9)).toEqual({ tsqFile: "ROOM_1.TSQ", sequenceIndex: 4 });
    expect(() => resolveFixedRoomBgm(-1, 0)).toThrow(RangeError);
    expect(() => resolveFixedRoomBgm(1, 256)).toThrow(RangeError);
  });

  it("does not turn ordinary free-roam location identity into an activity BGM selector", () => {
    expect(resolveNativeBgmScene({ kind: "ordinary-free-roam" })).toBeUndefined();
    expect(resolveNativeBgmScene({ kind: "q-factory" })).toEqual({ tsqFile: "ROOM_1.TSQ", sequenceIndex: 1 });
    expect(resolveNativeBgmScene({ kind: "fixed-interior", areaIndex: 6, localIndex: 2 })).toEqual({
      tsqFile: "ROOM_1.TSQ",
      sequenceIndex: 3,
    });
    expect(resolveNativeBgmScene({ kind: "ordinary-race", sceneSelector: 3 })).toEqual({
      tsqFile: "BGM_08.TSQ",
      sequenceIndex: 1,
    });
  });
});

describe("PAL native BGM lifecycle", () => {
  const program = { tsqFile: "BGM_08.TSQ", sequenceIndex: 1 } as const;

  it("selects before the initial start", () => {
    expect(initialBgmStart(program)).toEqual([
      { kind: "select", program },
      { kind: "start" },
    ]);
  });
  it("preserves the proven transition ordering", () => {
    expect(transitionBgmTo(program)).toEqual([
      { kind: "fade-out" },
      { kind: "hard-stop" },
      { kind: "select", program },
      { kind: "start" },
    ]);
  });

  it("keeps mute/unmute distinct from hard stop or restart", () => {
    expect(nativeMuteCommand(true)).toEqual({ kind: "mute" });
    expect(nativeMuteCommand(false)).toEqual({ kind: "unmute" });
    expect(nativeFadeCommand("out")).toEqual({ kind: "fade-out" });
    expect(nativeFadeCommand("in")).toEqual({ kind: "fade-in" });
    expect(palMusicFadeAudioUpdates).toBe(64);
  });

  it("delays ordinary-race start to update 250 while resolving through sceneId", () => {
    expect(palOrdinaryRaceMusicStartUpdate).toBe(250);
    expect(ordinaryRaceBgmSetup(3)).toEqual({
      program: { tsqFile: "BGM_08.TSQ", sequenceIndex: 1 },
      startUpdate: 250,
    });
  });
});
