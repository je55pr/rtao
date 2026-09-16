import { describe, expect, test } from "vitest";
import { nativeRaceContactGripWord, type NativeRaceEquipment } from "./nativeRaceVehicle";

const equipment: NativeRaceEquipment = {
  surfaceGrips: [11, 22, 33, 44, 55, 66],
  engineScalar: 0,
  fuelConsumption: 0,
  mass: 1,
  steeringScalar: 0,
  brakeCurve: new Uint8Array(32),
  gearWords: Array<number>(8).fill(0),
};

describe("native race contact grip", () => {
  test("uses the six copied tyre words and exact zero-filled slots 6/7", () => {
    expect(Array.from({ length: 8 }, (_, surfaceIndex) => nativeRaceContactGripWord(equipment, surfaceIndex)))
      .toEqual([11, 22, 33, 44, 55, 66, 0, 0]);
  });

  test.each([-1, 8, 1.5, Number.NaN])("rejects unresolved surface index %s", (surfaceIndex) => {
    expect(() => nativeRaceContactGripWord(equipment, surfaceIndex)).toThrow("Unresolved native contact surface.");
  });
});
