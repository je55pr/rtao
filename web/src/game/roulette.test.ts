import { describe, expect, it } from "vitest";
import {
  maximumNativeRouletteWager,
  nativeRouletteBetMultipliers,
  nativeRoulettePocketIndex,
  nativeRoulettePocketNumbers,
  resolveNativeRouletteOutcome,
} from "./roulette";

describe("native Roulette", () => {
  it("locks the PAL physical-pocket number order and bet multipliers", () => {
    expect(nativeRoulettePocketNumbers).toEqual([
      0, 6, 8, 18, 10, 4, 12, 16, 14, 2,
      0, 5, 7, 17, 9, 3, 11, 15, 13, 1,
      0,
    ]);
    expect(nativeRouletteBetMultipliers).toEqual([
      18, 18, 18, 18, 18, 18, 18, 18, 18,
      18, 18, 18, 18, 18, 18, 18, 18, 18,
      3, 3, 3, 2, 2,
    ]);
  });

  it("uses the executable's half-pocket rounding and 3,276-unit bins", () => {
    expect(nativeRoulettePocketIndex(0, 0)).toBe(0);
    expect(nativeRoulettePocketIndex(1_637, 0)).toBe(0);
    expect(nativeRoulettePocketIndex(1_638, 0)).toBe(1);
    expect(nativeRoulettePocketIndex(-1_638, 0)).toBe(0);
    expect(nativeRoulettePocketIndex(-1_639, 0)).toBe(20);
  });

  it("matches number, six-number group and colour bets exactly", () => {
    expect(resolveNativeRouletteOutcome(3, 17, 100)).toMatchObject({ number: 18, won: true, multiplier: 18, payoutCake: 1_800 });
    expect(resolveNativeRouletteOutcome(1, 18, 100)).toMatchObject({ number: 6, won: true, multiplier: 3, payoutCake: 300 });
    expect(resolveNativeRouletteOutcome(2, 19, 100)).toMatchObject({ number: 8, won: true, multiplier: 3, payoutCake: 300 });
    expect(resolveNativeRouletteOutcome(3, 21, 100)).toMatchObject({ colourIndex: 1, won: false, payoutCake: 0 });
    expect(resolveNativeRouletteOutcome(3, 22, 100)).toMatchObject({ colourIndex: 1, won: true, multiplier: 2, payoutCake: 200 });
  });

  it("preserves the native two-zero physical pockets and colour matching", () => {
    expect(resolveNativeRouletteOutcome(0, 0, 100)).toMatchObject({ number: 0, won: false, colourIndex: 0 });
    expect(resolveNativeRouletteOutcome(0, 21, 100)).toMatchObject({ number: 0, won: true, colourIndex: 0, payoutCake: 200 });
    expect(resolveNativeRouletteOutcome(10, 22, 100)).toMatchObject({ number: 0, won: true, colourIndex: 1, payoutCake: 200 });
    expect(resolveNativeRouletteOutcome(20, 22, 100)).toMatchObject({ number: 0, won: true, colourIndex: 1, payoutCake: 200 });
    expect(resolveNativeRouletteOutcome(20, 18, 100)).toMatchObject({ number: 0, won: true, payoutCake: 300 });
  });

  it("caps the selectable wager at current Cake or 10,000", () => {
    expect(maximumNativeRouletteWager(999)).toBe(999);
    expect(maximumNativeRouletteWager(10_000)).toBe(10_000);
    expect(maximumNativeRouletteWager(999_999)).toBe(10_000);
    expect(() => resolveNativeRouletteOutcome(0, 0, 0)).toThrow(RangeError);
  });
});
