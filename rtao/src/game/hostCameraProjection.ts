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
