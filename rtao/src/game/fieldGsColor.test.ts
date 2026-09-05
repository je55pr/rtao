import { describe, expect, it } from "vitest";
import { hg2DisplaySpaceCompositeByte, hg2FieldDirectDisplayByte, hg2FieldModulatedDisplayByte, hg2FieldModulateFactor, linearSpaceCompositeByte } from "./fieldGsColor";

describe("HG2 field GS colour domain", () => {
  it("uses 128 as the neutral MODULATE colour", () => {
    expect(hg2FieldModulateFactor(128)).toBe(1);
    expect(hg2FieldModulatedDisplayByte(200, 128)).toBe(200);
    expect(hg2FieldModulatedDisplayByte(200, 64)).toBe(100);
  });

  it("applies the executable's 1.1 field-light weight only once", () => {
    const raw = 119.817;
    expect(hg2FieldModulateFactor(raw, 1.1)).toBeCloseTo(1.02968, 4);
    // The erroneous lost experiment effectively multiplied this by another
    // 255/128 (~1.992), producing the observed neon-bright result.
    expect(hg2FieldModulateFactor(raw, 1.1) * (255 / 128)).toBeGreaterThan(2);
  });

  it("treats untextured field RGB as a direct GS display value", () => {
    expect(hg2FieldDirectDisplayByte(64)).toBe(64);
    expect(hg2FieldDirectDisplayByte(120, 1.1)).toBeCloseTo(132);
  });

  it("keeps fog/alpha composition in GS display space rather than linear light", () => {
    const encoded = hg2DisplaySpaceCompositeByte(120, 8, 0.35);
    expect(encoded).toBeCloseTo(47.2, 1);
    // A naive linear-light blend is materially brighter, which matches the
    // remaining night-scene discrepancy seen before this correction.
    expect(linearSpaceCompositeByte(120, 8, 0.35)).toBeGreaterThan(encoded + 10);
  });
});
