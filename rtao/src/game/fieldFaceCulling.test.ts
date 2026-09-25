import { describe, expect, test } from "vitest";
import {
  palFieldFaceCullMode,
  palFieldSubmissionFamily,
} from "./fieldFaceCulling";

describe("PAL field face-culling policy", () => {
  test("ordinary MSCALF-8 geometry is recovered as uncullled", () => {
    const family = palFieldSubmissionFamily({ billboard: false });
    expect(family).toBe("ordinary-mscalf8");
    expect(palFieldFaceCullMode(family)).toBe("none");
  });

  test("billboard and dynamic-object families remain explicitly fail-closed", () => {
    const billboard = palFieldSubmissionFamily({ billboard: true });
    expect(billboard).toBe("billboard-mscalf6");
    expect(palFieldFaceCullMode(billboard)).toBe("unresolved");
    expect(palFieldFaceCullMode("dynamic-mscalf4")).toBe("unresolved");
  });
});
