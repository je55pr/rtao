import * as THREE from "three";
import type { NativeCameraProjectionContract } from "./nativeCameraFinalOutput";

export interface HostCameraProjectionFallback {
  readonly authority: "host-policy";
  readonly verticalFovDegrees: number;
  readonly initialAspect: number;
  readonly near: number;
  readonly far: number;
}

/**
 * Browser projection values retained only until PAL 0x002207e8 and the
 * 0x00220458 output block are mapped to renderer projection semantics.
 */
export const browserWorldCameraProjectionFallback: HostCameraProjectionFallback = Object.freeze({
  authority: "host-policy",
  verticalFovDegrees: 54,
  initialAspect: 1,
  near: 1,
  far: 40_000,
});

export const browserRaceCameraProjectionFallback: HostCameraProjectionFallback = Object.freeze({
  authority: "host-policy",
  verticalFovDegrees: 54,
  initialAspect: 1,
  near: 1,
  far: 20_000,
});

/** Viewport aspect is host presentation policy, not decoded PAL projection state. */
export function hostCameraViewportAspect(width: number, height: number): number {
  return width / height;
}

/** Apply PAL's recovered 640x224 projection to a Three.js camera. */
export function applyNativeCameraProjection(
  camera: THREE.PerspectiveCamera,
  projection: NativeCameraProjectionContract,
): void {
  const [centerX, centerY] = projection.center;
  const halfWidth = 320 / (projection.focal * (projection.displayScaleMode === 0 ? 1 : Math.fround(0.8)));
  const halfHeight = 112 / (projection.focal * (projection.displayScaleMode === 0 ? Math.fround(0.47) : Math.fround(0.53)));
  const centerOffsetX = (centerX - 2048) / 320 * halfWidth;
  const centerOffsetY = (centerY - 2048) / 112 * halfHeight;
  camera.near = projection.near;
  camera.far = projection.far;
  camera.projectionMatrix.makePerspective(
    (-halfWidth + centerOffsetX) * projection.near,
    (halfWidth + centerOffsetX) * projection.near,
    (halfHeight + centerOffsetY) * projection.near,
    (-halfHeight + centerOffsetY) * projection.near,
    projection.near,
    projection.far,
  );
  camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
}
