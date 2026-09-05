import { describe, expect, test } from "vitest";
import {
  nativeTransmissionLaunchAccelerationRatio,
  nativeTransmissionProfile,
  nativeTransmissionTopSpeedRatio,
} from "./nativeTransmissionPerformance";

describe("native PAL transmission ratios", () => {
  test("preserves all six executable records", () => {
    expect(nativeTransmissionProfile(0)).toMatchObject({ name: "Normal Transmission", price: 200, ratios: [-95, 116, 162, 227, 318, 446, 0, 0] });
    expect(nativeTransmissionProfile(1)).toMatchObject({ name: "Sports Transmission", price: 1_000, ratios: [-95, 116, 182, 291, 408, 490, 0, 0] });
    expect(nativeTransmissionProfile(2)).toMatchObject({ name: "Power Transmission", price: 2_000, ratios: [-95, 128, 220, 276, 387, 464, 557, 0] });
    expect(nativeTransmissionProfile(3)).toMatchObject({ name: "Speed Transmission", price: 4_000, ratios: [-95, 128, 260, 327, 458, 550, 660, 0] });
    expect(nativeTransmissionProfile(4).ratios).toEqual([-95, 144, 300, 414, 539, 647, 711, 0]);
    expect(nativeTransmissionProfile(5).ratios).toEqual([-95, 156, 350, 446, 550, 625, 750, 0]);
  });

  test("derives launch and terminal ratios only from native gear words", () => {
    expect(nativeTransmissionLaunchAccelerationRatio(0)).toBe(1);
    expect(nativeTransmissionLaunchAccelerationRatio(1)).toBe(1);
    expect(nativeTransmissionLaunchAccelerationRatio(2)).toBeCloseTo(116 / 128);
    expect(nativeTransmissionTopSpeedRatio(1)).toBeCloseTo(490 / 446);
    expect(nativeTransmissionTopSpeedRatio(2)).toBeCloseTo(557 / 446);
    expect(nativeTransmissionTopSpeedRatio(3)).toBeCloseTo(660 / 446);
  });

  test("rejects selectors outside the executable table", () => {
    expect(() => nativeTransmissionProfile(-1)).toThrow(RangeError);
    expect(() => nativeTransmissionProfile(6)).toThrow(RangeError);
    expect(() => nativeTransmissionProfile(1.5)).toThrow(RangeError);
  });
});
