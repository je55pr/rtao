import { describe, expect, test } from "vitest";
import { cloudHillSpecialOutdoorScene, fixedInteractionReturnPosition, specialOutdoorSceneForAreaCode } from "./specialOutdoor";

describe("Cloud Hill special-outdoor host", () => {
  test("maps native area-code 64 to ACTION/A16 without inventing FLD/064", () => {
    expect(cloudHillSpecialOutdoorScene).toEqual({
      areaIndex: 8,
      areaCode: 64,
      actionSceneId: 16,
      sourcePath: "ACTION/A16.BIN",
    });
    expect(specialOutdoorSceneForAreaCode(64)).toBe(cloudHillSpecialOutdoorScene);
    expect(specialOutdoorSceneForAreaCode(63)).toBeUndefined();
  });

  test("places selector zero on the recovered Q's Factory return edge", () => {
    const position = fixedInteractionReturnPosition({
      corners: [
        [826.22998046875, 731],
        [838.22998046875, 731],
        [836.22998046875, 725],
        [828.22998046875, 725],
      ],
    });
    expect(position.x).toBeCloseTo(767.77001953125, 8);
    expect(position.z).toBe(725);
  });
});
