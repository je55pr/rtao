import { describe, expect, it } from "vitest";
import { resolveCueBinName } from "./source";

describe("CUE BIN resolution", () => {
  it("accepts a renamed BIN when it is the archive's only candidate", () => {
    expect(resolveCueBinName(
      "Road Trip Adventure (Europe) (En,Fr,De).bin",
      ["Road Trip Adventure/Road Trip Adventure.bin"],
    )).toBe("Road Trip Adventure/Road Trip Adventure.bin");
  });

  it("still prefers an exact case-insensitive match", () => {
    expect(resolveCueBinName("GAME.BIN", ["other.bin", "disc/Game.bin"]))
      .toBe("disc/Game.bin");
  });

  it("rejects an unmatched CUE when multiple BIN files make the choice ambiguous", () => {
    expect(resolveCueBinName("missing.bin", ["disc-1.bin", "disc-2.bin"]))
      .toBeUndefined();
  });
});
