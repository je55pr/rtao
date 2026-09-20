import { nativeChasePi, type NativeChaseCameraState } from "./nativeChaseCamera";
import { transformNativeRaceVector, type NativeRaceMatrix } from "./nativeRaceMath";
import type { NativeCameraFinalOutput, NativeCameraVector } from "./nativeCameraRuntimeContract";

const f = Math.fround;

export type NativeCameraDisplayScaleMode = 0 | 1;
export type NativeCameraProjectionCenterMode = "ordinary" | "state-2" | "state-3";

export interface NativeCameraProjectionContract {
  readonly focal: number;
  readonly normalizedFocal: number;
  readonly displayScaleMode: NativeCameraDisplayScaleMode;
  readonly center: readonly [number, number];
  readonly near: number;
  readonly far: number;
  readonly perspectiveDepthScale: number;
  readonly perspectiveDepthBias: number;
  readonly gsViewportScale: readonly [number, number];
  readonly gsReverseDepthScale: number;
  readonly gsReverseDepthBias: number;
  readonly horizontalFovDegrees: number;
  readonly verticalFovDegrees: number;
  readonly aspect: number;
}

const projectionCenter: Record<NativeCameraProjectionCenterMode, readonly [number, number]> = {
  ordinary: [2048, 2048],
  "state-2": [2048, 1992],
  "state-3": [2048, 2104],
};
export function nativeCameraFinalOutput(
  controller: NativeChaseCameraState,
  worldMatrix: NativeRaceMatrix,
): NativeCameraFinalOutput {
  if (worldMatrix.length !== 16 || worldMatrix.some((value) => !Number.isFinite(value))) {
    throw new RangeError("Native camera world matrix requires 16 finite lanes.");
  }
  const pitch = nativeCameraSignedAngleRadians(controller.pitchAngle);
  const yaw = nativeCameraSignedAngleRadians(controller.recenter.angle + controller.slipInput);
  const localEye = rotateLocalCameraVector(controller.localOffset, pitch, yaw, 1);
  const localForward = rotateLocalCameraVector([0, 0, 1, 0], pitch, yaw, 0);
  const eye = transformNativeRaceVector(worldMatrix, localEye);
  const forward = transformNativeRaceVector(worldMatrix, localForward);
  return {
    eye: [eye[0], eye[1], eye[2]],
    forward: [forward[0], forward[1], forward[2]],
    focal: controller.focal,
  };
}

/**
 * Completes the camera W matrix after the 0x0021EAC8 orientation stage.
 * `translation` must already be decoded into native float world coordinates;
 * this helper intentionally does not emulate the packed car-position decoder at 0x0021D6A0.
 */
export function nativeCameraWorldMatrix(
  orientation: NativeRaceMatrix,
  translation: NativeCameraVector,
): NativeRaceMatrix {
  if (orientation.length !== 16 || orientation.some((value) => !Number.isFinite(value))) {
    throw new RangeError("Native camera orientation matrix requires 16 finite lanes.");
  }
  if (translation.some((value) => !Number.isFinite(value))) {
    throw new RangeError("Native camera world translation requires finite coordinates.");
  }
  const result = [...orientation];
  result[12] = f(translation[0]);
  result[13] = f(translation[1]);
  result[14] = f(translation[2]);
  result[15] = 1;
  return result;
}

export function nativeCameraProjectionContract(
  focal: number,
  displayScaleMode: NativeCameraDisplayScaleMode,
  centerMode: NativeCameraProjectionCenterMode = "ordinary",
): NativeCameraProjectionContract {
  if (!Number.isFinite(focal) || focal <= 0) {
    throw new RangeError("Native camera focal parameter must be positive and finite.");
  }
  const [xScale, yScale] = displayScaleMode === 0
    ? [1, Math.fround(0.47)]
    : [Math.fround(0.8), Math.fround(0.53)];
  const horizontalFovRadians = 2 * Math.atan(320 / (focal * xScale));
  const verticalFovRadians = 2 * Math.atan(112 / (focal * yScale));
  return {
    focal,
    normalizedFocal: focal / 512,
    displayScaleMode,
    center: projectionCenter[centerMode],
    near: 1.5,
    far: 65_536,
    perspectiveDepthScale: 1.0000457763671875,
    perspectiveDepthBias: -3.0000686645507812,
    gsViewportScale: [512 * xScale, 512 * yScale],
    gsReverseDepthScale: -8_388_499.5,
    gsReverseDepthBias: 8_388_500.5,
    horizontalFovDegrees: horizontalFovRadians * 180 / Math.PI,
    verticalFovDegrees: verticalFovRadians * 180 / Math.PI,
    aspect: Math.tan(horizontalFovRadians / 2) / Math.tan(verticalFovRadians / 2),
  };
}

export function nativeCameraSignedAngleRadians(raw: number): number {
  const signed = (raw << 16) >> 16;
  return f(f(signed * nativeChasePi) / 32768);
}

function rotateLocalCameraVector(
  vector: readonly [number, number, number, number],
  pitch: number,
  yaw: number,
  w: number,
): readonly [number, number, number, number] {
  const pitchSin = f(Math.sin(pitch));
  const pitchCos = f(Math.cos(pitch));
  const yawSin = f(Math.sin(yaw));
  const yawCos = f(Math.cos(yaw));
  const x = f(vector[0]);
  const y = f(vector[1]);
  const z = f(vector[2]);
  const pitchedY = f(f(y * pitchCos) - f(z * pitchSin));
  const pitchedZ = f(f(y * pitchSin) + f(z * pitchCos));
  return [
    f(f(x * yawCos) + f(pitchedZ * yawSin)),
    pitchedY,
    f(f(-x * yawSin) + f(pitchedZ * yawCos)),
    w,
  ];
}
