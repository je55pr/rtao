import { describe, expect, test } from "vitest";
import { nativeWheelSectionIndex, readHg2Header } from "./carGeometry";

describe("HG2 car containers", () => {
  test("reads the monotonic section table and final texture span", () => {
    const bytes = new Uint8Array(64);
    const view = new DataView(bytes.buffer);
    for (const [index, value] of [16, 32, 48, 64].entries()) view.setUint32(index * 4, value, true);
    expect(readHg2Header(bytes)).toEqual({ offsets: [16, 32, 48, 64], textureOffset: 48, textureLength: 16 });
  });


  test("maps native wheel selector byte +6 to WHEEL.BIN section selector+1", () => {
    expect(nativeWheelSectionIndex(0)).toBe(1);
    expect(nativeWheelSectionIndex(1)).toBe(2);
    expect(nativeWheelSectionIndex(2)).toBe(3);
    expect(nativeWheelSectionIndex(14)).toBe(15);
    expect(() => nativeWheelSectionIndex(15)).toThrow(RangeError);
  });
});
