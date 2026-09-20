import {
  beginNativeChaseRecenter,
  createNativeChaseCameraState,
  resetNativeChaseLag,
  selectNativeChasePreset,
  type NativeChaseCameraState,
  type NativeChaseVector,
} from "./nativeChaseCamera";

export type NativeCameraVector = NativeChaseVector;

export interface NativeCameraFinalOutput {
  /** Output +0x170 native camera-world translation column. */
  readonly eye: NativeCameraVector;
  /** Output +0x180 native +Z-forward direction. */
  readonly forward: NativeCameraVector;
  /** Output +0x18C focal parameter copied from camera state +0x10. */
  readonly focal: number;
}

export interface NativeCameraRenderPose {
  readonly position: NativeCameraVector;
  readonly target: NativeCameraVector;
}

export interface NativeCameraRendererBoundary<TProjection = unknown> {
  /**
   * Converts one native-space point into the renderer coordinate system.
   * Handedness/reflection belongs here, after the native camera has produced
   * its final output.
   */
  readonly toRenderPoint: (point: NativeCameraVector) => NativeCameraVector;
  /**
   * Renderer-owned projection state. The retained chase archaeology does not
   * yet prove the output-builder projection values used by the browser.
   */
  readonly projection: TProjection;
}
export interface NativeCameraRenderFrame<TProjection = unknown> {
  readonly pose: NativeCameraRenderPose;
  readonly projection: TProjection;
}

export interface NativeCameraRenderSelection {
  readonly source: "native-final-output" | "host-fallback";
  readonly pose: NativeCameraRenderPose;
}

export interface NativeCameraObstructionProbe {
  readonly point: NativeCameraVector;
}

export interface NativeCameraObstructionSample {
  /**
   * Mirrors the executable branch distinction only: false means the selected
   * scene collision query rejected the probe.
   */
  readonly valid: boolean;
  /**
   * Corrected native-space height when the selected scene query supplies one.
   * Exact collision-query arguments remain owned by the scene adapter.
   */
  readonly correctedY?: number;
}

export type NativeCameraObstructionQuery = (
  probe: NativeCameraObstructionProbe,
) => NativeCameraObstructionSample;

export interface NativeCameraRuntimeContractState {
  readonly controller: NativeChaseCameraState;
  /**
   * Present only after a native output-builder implementation has produced the
   * final pose. Native chase state alone is not this output.
   */
  readonly finalOutput?: NativeCameraFinalOutput;
}

export type NativeCameraLifecycleEvent =
  | { readonly kind: "native-lag-reset" }
  | { readonly kind: "native-recenter" }
  | { readonly kind: "native-preset-select"; readonly presetIndex: number }
  | { readonly kind: "host-output-invalidate" };
export function createNativeCameraRuntimeContractState(
  presetIndex: number,
): NativeCameraRuntimeContractState {
  return { controller: createNativeChaseCameraState(presetIndex) };
}

export function withNativeCameraFinalOutput(
  state: NativeCameraRuntimeContractState,
  finalOutput: NativeCameraFinalOutput,
): NativeCameraRuntimeContractState {
  return { ...state, finalOutput };
}

/** A final output belongs to one controller snapshot and is stale after it advances. */
export function replaceNativeCameraController(
  state: NativeCameraRuntimeContractState,
  controller: NativeChaseCameraState,
): NativeCameraRuntimeContractState {
  if (state.controller === controller && state.finalOutput === undefined) return state;
  return { controller };
}

export function applyNativeCameraLifecycle(
  state: NativeCameraRuntimeContractState,
  event: NativeCameraLifecycleEvent,
): NativeCameraRuntimeContractState {
  switch (event.kind) {
    case "native-lag-reset":
      return { controller: resetNativeChaseLag(state.controller) };
    case "native-recenter":
      return { controller: beginNativeChaseRecenter(state.controller) };
    case "native-preset-select":
      return {
        controller: selectNativeChasePreset(state.controller, event.presetIndex),
      };
    case "host-output-invalidate":
      return state.finalOutput === undefined
        ? state
        : { controller: state.controller };
  }
}

export function nativeCameraFrameForRenderer<TProjection>(
  output: NativeCameraFinalOutput,
  boundary: NativeCameraRendererBoundary<TProjection>,
): NativeCameraRenderFrame<TProjection> {
  const target: NativeCameraVector = [
    output.eye[0] + output.forward[0],
    output.eye[1] + output.forward[1],
    output.eye[2] + output.forward[2],
  ];
  return {
    pose: {
      position: boundary.toRenderPoint(output.eye),
      target: boundary.toRenderPoint(target),
    },
    projection: boundary.projection,
  };
}

/**
 * Produces a native-backed renderer frame only when the native output-builder
 * has supplied final output. Controller/follow state is deliberately not used
 * as a substitute, leaving the caller free to select an explicit host fallback.
 */
export function nativeCameraFrameFromStateForRenderer<TProjection>(
  state: NativeCameraRuntimeContractState,
  boundary: NativeCameraRendererBoundary<TProjection>,
): NativeCameraRenderFrame<TProjection> | undefined {
  return state.finalOutput === undefined
    ? undefined
    : nativeCameraFrameForRenderer(state.finalOutput, boundary);
}

export function selectNativeCameraRenderPose(
  state: NativeCameraRuntimeContractState,
  toRenderPoint: (point: NativeCameraVector) => NativeCameraVector,
  hostFallback: NativeCameraRenderPose,
): NativeCameraRenderSelection {
  if (state.finalOutput === undefined) {
    return { source: "host-fallback", pose: hostFallback };
  }
  const target: NativeCameraVector = [
    state.finalOutput.eye[0] + state.finalOutput.forward[0],
    state.finalOutput.eye[1] + state.finalOutput.forward[1],
    state.finalOutput.eye[2] + state.finalOutput.forward[2],
  ];
  return {
    source: "native-final-output",
    pose: {
      position: toRenderPoint(state.finalOutput.eye),
      target: toRenderPoint(target),
    },
  };
}
/**
 * Common reflected-X boundary used by HG2 field/course presentation.
 * The origin is supplied by the scene adapter rather than hidden in camera
 * arithmetic so native output stays in native coordinates.
 */
export function reflectNativeCameraPointX(
  point: NativeCameraVector,
  xOrigin: number,
): NativeCameraVector {
  if (!Number.isFinite(xOrigin)) {
    throw new RangeError("Native camera X-reflection origin must be finite.");
  }
  return [xOrigin - point[0], point[1], point[2]];
}
