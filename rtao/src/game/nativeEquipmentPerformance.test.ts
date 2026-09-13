import { describe, expect, test } from "vitest";
import { nativeEngineAccelerationRatio, nativeEngineDriveScalars, nativeSteeringRatio, nativeSteeringScalars } from "./nativeEquipmentPerformance";

describe("native equipment performance", () => {
  test("preserves all twelve PAL engine drive scalars and exact relative response", () => {
    expect(nativeEngineDriveScalars).toEqual([1500, 1800, 2200, 2600, 2900, 3300, 3600, 3900, 4200, 4500, 6000, 30000]);
    expect(nativeEngineAccelerationRatio(0)).toBe(1);
    expect(nativeEngineAccelerationRatio(3)).toBeCloseTo(26 / 15, 12);
    expect(nativeEngineAccelerationRatio(5)).toBe(2.2);
    expect(nativeEngineAccelerationRatio(11)).toBe(20);
    expect(() => nativeEngineAccelerationRatio(12)).toThrow(RangeError);
  });

  test("preserves all four PAL steering scalars and exact ratios", () => {
    expect(nativeSteeringScalars).toEqual([64, 96, 128, 160]);
    expect(nativeSteeringRatio(0)).toBe(1);
    expect(nativeSteeringRatio(1)).toBe(1.5);
    expect(nativeSteeringRatio(2)).toBe(2);
    expect(nativeSteeringRatio(3)).toBe(2.5);
    expect(() => nativeSteeringRatio(4)).toThrow(RangeError);
  });
});
