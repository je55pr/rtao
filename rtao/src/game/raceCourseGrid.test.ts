import { describe, expect, test } from "vitest";
import type { RaceStartSeed } from "../formats/raceCatalogue";
import { RaceCourseGridSampler } from "./raceCourseGrid";
import { flatFieldCollision } from "./worldCollision";

describe("PAL race course start grid", () => {
  test("reflects, grounds and rotates a native start seed", () => {
    const sampler = new RaceCourseGridSampler(flatFieldCollision(42.5, 0x102));
    const seed: RaceStartSeed = {
      courseId: 9, startIndex: 3, nativeX: 763.5, nativeY: 12.5,
      nativeZ: 921.3, nativeYaw: 0x4000,
    };
    expect(sampler.ground(seed)).toEqual({
      courseId: 9,
      startIndex: 3,
      position: { x: 836.5, y: 42.5, z: 921.3 },
      yaw: -Math.PI / 2,
      surfaceFlags: 0x102,
    });
  });

  test("fails explicitly when a native seed has no course collision", () => {
    const sampler = new RaceCourseGridSampler({
      triangleCount: 0, positions: new Float32Array(), surfaceFlags: new Uint32Array(),
    });
    expect(() => sampler.ground({
      courseId: 0, startIndex: 23, nativeX: 457.2, nativeY: 1.1,
      nativeZ: 568.8, nativeYaw: 0x4000,
    })).toThrow(/C00 start slot 23/);
  });
});
