import { describe, expect, test } from "vitest";
import { nativeEngineAccelerationRatio, nativeSteeringRatio, nativeSteeringScalars } from "./nativeEquipmentPerformance";

describe("native equipment performance", () => {
  test("uses the PAL engine drive scalar relative to Normal Engine", () => {
    expect(nativeEngineAccelerationRatio(0)).toBe(1);
    expect(nativeEngineAccelerationRatio(1)).toBe(1.2);
    expect(nativeEngineAccelerationRatio(2)).toBeCloseTo(22 / 15, 12);
    expect(nativeEngineAccelerationRatio(5)).toBe(2.2);
    expect(() => nativeEngineAccelerationRatio(3)).toThrow(RangeError);
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
