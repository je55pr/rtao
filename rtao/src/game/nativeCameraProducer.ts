import {
  nativeCameraFinalOutput,
  nativeCameraWorldMatrix,
} from "./nativeCameraFinalOutput";
import {
  advanceNativeCameraWorldTransform,
  type NativeCameraWorldInputs,
} from "./nativeCameraWorldTransform";
import type {
  NativeCameraRuntimeContractState,
  NativeCameraVector,
} from "./nativeCameraRuntimeContract";
import type {
  NativeRaceMathData,
  NativeRaceMatrix,
} from "./nativeRaceMath";

export interface NativeCameraProducerInputs {
  /** Exact native inputs consumed by 0x0021EAC8. */
  readonly world: NativeCameraWorldInputs;
  /**
   * Native float translation decoded from the packed car position by the
   * 0x0021D6A0-equivalent host boundary.
   */
  readonly translation: NativeCameraVector;
  readonly math: NativeRaceMathData;
}

export interface NativeCameraProducerResult {
  /** Controller snapshot and final output from the same native producer pass. */
  readonly state: NativeCameraRuntimeContractState;
  /** Full W matrix consumed by 0x00220458 after translation is populated. */
  readonly worldMatrix: NativeRaceMatrix;
  /** Secondary matrix passed as a3 to 0x00220458. */
  readonly auxiliaryMatrix: NativeRaceMatrix;
}

/**
 * Composes only recovered producer stages.
 *
 * The caller must advance descriptor pitch/slip/recenter state first and must
 * supply decoded PAL car inputs. This function deliberately does not infer
 * missing host fields, display mode, obstruction results, or renderer policy.
 */
export function materializeNativeCameraFinalOutput(
  state: NativeCameraRuntimeContractState,
  inputs: NativeCameraProducerInputs,
): NativeCameraProducerResult {
  const world = advanceNativeCameraWorldTransform(
    state.controller,
    inputs.world,
    inputs.math,
  );
  const worldMatrix = nativeCameraWorldMatrix(
    world.orientationMatrix,
    inputs.translation,
  );
  const finalOutput = nativeCameraFinalOutput(world.controller, worldMatrix);
  return {
    state: {
      controller: world.controller,
      finalOutput,
    },
    worldMatrix,
    auxiliaryMatrix: world.auxiliaryMatrix,
  };
}
