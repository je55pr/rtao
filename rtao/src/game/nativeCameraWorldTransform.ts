import {
  advanceNativeChaseLagAxis,
  type NativeChaseCameraState,
} from "./nativeChaseCamera";
import { nativeCameraSignedAngleRadians } from "./nativeCameraFinalOutput";
import {
  multiplyNativeRaceMatrices,
  nativeRaceNormalBasis,
  nativeRaceYawMatrix,
  normalizeNativeRaceVector,
  type NativeRaceMathData,
  type NativeRaceMatrix,
  type NativeRaceVector,
} from "./nativeRaceMath";

const f = Math.fround;

export interface NativeCameraWorldInputs {
  /** Car record +0x10 vec4 consumed by 0x0021EAC8. */
  readonly sourceVector: NativeRaceVector;
  /** Car record +0x50 float. */
  readonly offset50: number;
  /** Car record +0x58 float. */
  readonly offset58: number;
  /** Car record +0x1D4 signed yaw. */
  readonly nativeYaw: number;
}
export interface NativeCameraWorldTransformResult {
  readonly controller: NativeChaseCameraState;
  /** Primary orientation matrix written by 0x0021EAC8 before 0x0021D6A0 fills translation. */
  readonly orientationMatrix: NativeRaceMatrix;
  /** Secondary matrix passed as a3 to 0x00220458. */
  readonly auxiliaryMatrix: NativeRaceMatrix;
}

export function advanceNativeCameraWorldTransform(
  controller: NativeChaseCameraState,
  input: NativeCameraWorldInputs,
  math: NativeRaceMathData,
): NativeCameraWorldTransformResult {
  const yawRadians = nativeCameraSignedAngleRadians(input.nativeYaw);
  const vehicleRotated = rotateCameraXZ(input.sourceVector, input.nativeYaw);

  let lagX = controller.lagX;
  let lagZ = controller.lagZ;
  let base: NativeRaceVector;
  if (controller.modeFlags === 0) {
    lagZ = advanceNativeChaseLagAxis(lagZ, vehicleRotated[2]);
    base = [f(-input.offset50), 1, lagZ.value, 0];
  } else {
    lagX = advanceNativeChaseLagAxis(lagX, vehicleRotated[0]);
    lagZ = advanceNativeChaseLagAxis(lagZ, vehicleRotated[2]);
    base = [
      f(lagX.value - f(input.offset50)),
      vehicleRotated[1],
      f(lagZ.value + f(input.offset58)),
      0,
    ];
  }

  const relativeRaw = controller.recenter.angle + controller.slipInput;
  const relativeVector = rotateCameraXZ(base, relativeRaw);
  const auxiliaryNormal = normalizeNativeRaceVector(relativeVector);

  // The second manual X/Z rotation uses -(vehicleYaw + relativeYaw). Because
  // relativeVector already contains +relativeYaw in the helper's convention,
  // the resulting normal is the vehicle/world basis consumed by the builder.
  const worldNormal = normalizeNativeRaceVector(
    rotateCameraXZ(relativeVector, -(input.nativeYaw + relativeRaw)),
  );
  const worldBasis = nativeRaceNormalBasis(worldNormal);
  const orientationMatrix = multiplyNativeRaceMatrices(
    worldBasis,
    nativeRaceYawMatrix(yawRadians, math),
  );
  return {
    controller: { ...controller, lagX, lagZ },
    orientationMatrix,
    auxiliaryMatrix: nativeRaceNormalBasis(auxiliaryNormal),
  };
}

/** Manual X/Z rotation sequence used by 0x0021EAC8 around retail sin/cos. */
export function rotateNativeCameraXZ(
  vector: NativeRaceVector,
  rawAngle: number,
): NativeRaceVector {
  return rotateCameraXZ(vector, rawAngle);
}

function rotateCameraXZ(vector: NativeRaceVector, rawAngle: number): NativeRaceVector {
  const radians = nativeCameraSignedAngleRadians(rawAngle);
  const sine = f(Math.sin(radians));
  const cosine = f(Math.cos(radians));
  const x = f(vector[0]);
  const z = f(vector[2]);
  return [
    f(f(x * cosine) - f(z * sine)),
    f(vector[1]),
    f(f(x * sine) + f(z * cosine)),
    f(vector[3]),
  ];
}
