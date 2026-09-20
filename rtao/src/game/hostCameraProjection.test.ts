import { describe, expect, test } from "vitest";
import {
  browserRaceCameraProjectionFallback,
  browserWorldCameraProjectionFallback,
} from "./hostCameraProjection";

describe("host camera projection fallback", () => {
  test("keeps live projection values explicitly host-owned", () => {
    expect(browserWorldCameraProjectionFallback).toEqual({
      authority: "host-policy",
      verticalFovDegrees: 54,
      near: 1,
      far: 40_000,
    });
    expect(browserRaceCameraProjectionFallback).toEqual({
      authority: "host-policy",
      verticalFovDegrees: 54,
      near: 1,
      far: 20_000,
    });
    expect(Object.isFrozen(browserWorldCameraProjectionFallback)).toBe(true);
    expect(Object.isFrozen(browserRaceCameraProjectionFallback)).toBe(true);
  });
});
