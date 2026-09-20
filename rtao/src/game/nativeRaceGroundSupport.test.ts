import { expect, test } from "vitest";
import {
  advanceNativeRaceGroundSupport,
  type NativeRaceGroundSupportInput,
} from "./nativeRaceGroundSupport";

function input(impulse: number): NativeRaceGroundSupportInput {
  return {
    pointY: Array(7).fill(0),
    heightWords: Array(7).fill(0),
    queryY: Array(7).fill(10000),
    support: [4096, 4096, 4096],
    supportDelta: [0, 0, 0],
    impulses: [impulse, 0, 0],
    localX: 0,
    localZ: 0,
    verticalImpulse: 0,
    equipmentFlags: 0,
    carFlags: 2,
    sceneFlags: 0,
  };
}

test("landing impact brackets the recovered 178/179 threshold", () => {
  const below = advanceNativeRaceGroundSupport(input(178));
  const at = advanceNativeRaceGroundSupport(input(179));
  expect(below.impactRequests).toEqual([]);
  expect(at.impactRequests).toEqual([{ channel: 0, kind: 1, strength: 11 }]);
  expect(below.impulses).toEqual([0, 0, 0]);
  expect(at.impulses).toEqual([0, 0, 0]);
  expect(below.supportDelta[0]).toBe(178);
  expect(at.supportDelta[0]).toBe(179);
});
