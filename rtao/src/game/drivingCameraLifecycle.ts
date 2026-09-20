import {
  rebaseBrowserChaseCamera,
  type BrowserChaseCameraState,
} from "./browserChaseCamera";
import {
  applyNativeCameraLifecycle,
  createNativeCameraRuntimeContractState,
  type NativeCameraRuntimeContractState,
} from "./nativeCameraRuntimeContract";
import { relativeRenderTranslation } from "./worldTopology";

export interface OutdoorDrivingCameraLifecycleState {
  readonly native: NativeCameraRuntimeContractState;
  readonly browser: BrowserChaseCameraState;
}

export function createOutdoorDrivingCameraLifecycleState(
  presetIndex: number,
): OutdoorDrivingCameraLifecycleState {
  return {
    native: createNativeCameraRuntimeContractState(presetIndex),
    browser: { position: [0, 0, 0], target: [0, 0, 0], ready: false },
  };
}

/**
 * FLD seams are coordinate-frame changes inside one native outdoor scene.
 * Rebase only host-local presentation and invalidate stale final output;
 * recovered lag/controller state remains continuous across the seam.
 */
export function rebaseOutdoorDrivingCameraAcrossFieldSeam(
  state: OutdoorDrivingCameraLifecycleState,
  fromFieldNumber: number,
  toFieldNumber: number,
): OutdoorDrivingCameraLifecycleState {
  const offset = relativeRenderTranslation(fromFieldNumber, toFieldNumber);
  return {
    native: applyNativeCameraLifecycle(
      state.native,
      { kind: "host-output-invalidate" },
    ),
    browser: rebaseBrowserChaseCamera(
      state.browser,
      offset.x,
      offset.y,
    ),
  };
}
