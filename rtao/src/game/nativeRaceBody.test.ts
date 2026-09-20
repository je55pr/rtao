import { describe, expect, test } from "vitest";
import { nativeRaceBodyMatrix, type NativeRaceBodyData } from "./nativeRaceBody";

const body: NativeRaceBodyData = {
  bodySideDivisor: 32768,
  bodyForwardDivisor: 32768,
  bigTyreLift: Math.fround(0.85),
};

describe("native race body attitude", () => {
  test("keeps rest support level and carries Big Tyre lift in the body matrix only", () => {
    const ordinary = nativeRaceBodyMatrix([4096, 4096, 4096], 0, body);
    const big = nativeRaceBodyMatrix([4096, 4096, 4096], 0x400, body);
    for (const [lane, expected] of [
      [0, 1], [1, 0], [2, 0], [4, 0], [5, 1], [6, 0], [8, 0], [9, 0], [10, 1],
    ] as const) expect(ordinary[lane]).toBeCloseTo(expected, 8);
    expect(ordinary[13]).toBe(0);
    expect(big.slice(0, 12)).toEqual(ordinary.slice(0, 12));
    expect(big[13]).toBe(Math.fround(0.85));
  });

  test("derives pitch, roll and ride displacement directly from three retained supports", () => {
    const matrix = nativeRaceBodyMatrix([4608, 3584, 4352], 0, body);
    expect(matrix[4]).toBeGreaterThan(0);
    expect(matrix[6]).toBeGreaterThan(0);
    expect(matrix[13]).toBeLessThan(0);
    expect(matrix).toEqual(nativeRaceBodyMatrix([4608, 3584, 4352], 0, body));
  });

  test("rejects malformed support/body authority instead of inventing an attitude", () => {
    expect(() => nativeRaceBodyMatrix([4096, 4096], 0, body)).toThrow(RangeError);
    expect(() => nativeRaceBodyMatrix([4096, 4096, 4096], 0, {
      ...body,
      bodyForwardDivisor: 0,
    })).toThrow(RangeError);
  });
});
