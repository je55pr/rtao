import * as THREE from "three";
import { describe, expect, test } from "vitest";
import { nativeCameraProjectionContract } from "./nativeCameraFinalOutput";
import {
  applyNativeCameraProjection,
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

  test("applies PAL focal, clip planes and ordinary center directly", () => {
    const camera = new THREE.PerspectiveCamera(54, 16 / 9, 1, 20_000);
    applyNativeCameraProjection(camera, nativeCameraProjectionContract(500, 1, "ordinary"));
    expect(camera.near).toBe(1.5);
    expect(camera.far).toBe(65_536);
    expect(camera.projectionMatrix.elements[8]).toBeCloseTo(0, 12);
    expect(camera.projectionMatrix.elements[9]).toBeCloseTo(0, 12);
    expect(camera.projectionMatrix.elements[0]).toBeCloseTo(500 * Math.fround(0.8) / 320, 6);
    expect(camera.projectionMatrix.elements[5]).toBeCloseTo(500 * Math.fround(0.53) / 112, 6);
  });

  test("preserves PAL shifted centers as off-axis projection", () => {
    const upper = new THREE.PerspectiveCamera();
    const lower = new THREE.PerspectiveCamera();
    applyNativeCameraProjection(upper, nativeCameraProjectionContract(500, 1, "state-2"));
    applyNativeCameraProjection(lower, nativeCameraProjectionContract(500, 1, "state-3"));
    expect(upper.projectionMatrix.elements[8]).toBeCloseTo(0, 12);
    expect(lower.projectionMatrix.elements[8]).toBeCloseTo(0, 12);
    expect(upper.projectionMatrix.elements[9]).not.toBeCloseTo(0, 12);
    expect(lower.projectionMatrix.elements[9]).toBeCloseTo(-upper.projectionMatrix.elements[9], 12);
  });
});
