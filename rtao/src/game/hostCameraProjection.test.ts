import { describe, expect, test } from "vitest";
import {
  browserRaceCameraProjectionFallback,
  browserWorldCameraProjectionFallback,
  hostCameraViewportAspect,
} from "./hostCameraProjection";

describe("host camera projection fallback", () => {
  test("keeps live projection values explicitly host-owned", () => {
    expect(browserWorldCameraProjectionFallback).toEqual({
      authority: "host-policy",
      verticalFovDegrees: 54,
      initialAspect: 1,
      near: 1,
      far: 40_000,
    });
    expect(browserRaceCameraProjectionFallback).toEqual({
      authority: "host-policy",
      verticalFovDegrees: 54,
      initialAspect: 1,
      near: 1,
      far: 20_000,
    });
    expect(Object.isFrozen(browserWorldCameraProjectionFallback)).toBe(true);
    expect(Object.isFrozen(browserRaceCameraProjectionFallback)).toBe(true);
  });

  test("keeps viewport aspect as explicit host presentation arithmetic", () => {
    expect(hostCameraViewportAspect(640, 480)).toBe(4 / 3);
    expect(hostCameraViewportAspect(1920, 1080)).toBe(16 / 9);
  });
});
