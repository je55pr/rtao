import { describe, expect, it } from "vitest";
import { flipRgbaRows } from "./capturePixels";

describe("capture pixel conversion", () => {
  it("flips WebGL bottom-up rows without changing pixels within a row", () => {
    const bottomUp = new Uint8Array([
      1, 2, 3, 4, 5, 6, 7, 8,
      11, 12, 13, 14, 15, 16, 17, 18,
    ]);
    expect([...flipRgbaRows(bottomUp, 2, 2)]).toEqual([
      11, 12, 13, 14, 15, 16, 17, 18,
      1, 2, 3, 4, 5, 6, 7, 8,
    ]);
  });
});
