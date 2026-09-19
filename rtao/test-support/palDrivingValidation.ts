import {
  advanceNativeChaseCamera,
  createNativeChaseCameraState,
  resetNativeChaseLag,
  selectNativeChasePreset,
} from "../src/game/nativeChaseCamera";
import type {
  DrivingCameraObservation,
  DrivingValidationObservation,
  DrivingValidationVector,
} from "../src/game/drivingValidation";
import type { NativeRaceFrameInput, NativeRaceFrameState } from "../src/game/nativeRaceFrame";

export interface PalFrameObservationResult {
  readonly state: NativeRaceFrameState;
  readonly contactFlags: number;
  readonly obstacleFlags: number;
}

export interface PalCameraTraceSample {
  readonly label: string;
  readonly tick: number;
  readonly nativeVehicle: {
    readonly position: DrivingValidationVector;
    readonly nativeYaw: number;
    readonly nativeSlip: number;
    readonly presetIndex: number;
    readonly resetLag?: boolean;
  };
  readonly palCamera: {
    readonly position: DrivingValidationVector;
    readonly target: DrivingValidationVector;
  };
}

export interface PalCameraTrace {
  readonly schema: 1;
  readonly tolerance: number;
  readonly samples: readonly PalCameraTraceSample[];
}

export function nativeRaceFrameObservation(
  label: string,
  tick: number,
  input: NativeRaceFrameInput,
  result: PalFrameObservationResult,
): DrivingValidationObservation {
  const { state } = result;
  return {
    label,
    tick,
    commands: input.commands,
    equipmentFlags: input.equipmentFlags,
    pose: {
      position: vector3(state.coordinates),
      yaw: state.vehicle.yaw,
    },
    velocity: vector3(state.velocity),
    vehicle: {
      nativeSpeed: state.vehicle.nativeSpeed,
      gear: state.vehicle.gear,
      equipmentBoostState: state.equipmentBoostState,
    },
    contact: {
      support: vector3(state.contact.support),
      impulses: vector3(state.contact.impulses),
      surfaces: [...state.surfaces],
      contactFlags: result.contactFlags,
      obstacleFlags: result.obstacleFlags,
    },
  };
}

export function parsePalCameraTrace(text: string): PalCameraTrace {
  const value: unknown = JSON.parse(text);
  if (!isRecord(value) || value.schema !== 1 || !isFiniteNonNegative(value.tolerance) || !Array.isArray(value.samples)) {
    throw new TypeError("PAL camera trace must contain schema=1, a non-negative tolerance and a samples array.");
  }
  const samples = value.samples.map((sample, index) => parseCameraSample(sample, index));
  if (samples.length === 0) throw new TypeError("PAL camera trace must contain at least one sample.");
  return { schema: 1, tolerance: value.tolerance, samples };
}

export function nativeCameraObservations(trace: PalCameraTrace): DrivingCameraObservation[] {
  let state = createNativeChaseCameraState(trace.samples[0]!.nativeVehicle.presetIndex);
  return trace.samples.map((sample) => {
    if (sample.nativeVehicle.presetIndex !== state.presetIndex) {
      state = selectNativeChasePreset(state, sample.nativeVehicle.presetIndex);
    }
    if (sample.nativeVehicle.resetLag) state = resetNativeChaseLag(state);
    state = advanceNativeChaseCamera(state, sample.nativeVehicle);
    return {
      label: sample.label,
      tick: sample.tick,
      position: state.position,
      target: state.target,
    };
  });
}

export function palCameraObservations(trace: PalCameraTrace): DrivingCameraObservation[] {
  return trace.samples.map((sample) => ({
    label: sample.label,
    tick: sample.tick,
    position: sample.palCamera.position,
    target: sample.palCamera.target,
  }));
}

function parseCameraSample(value: unknown, index: number): PalCameraTraceSample {
  if (!isRecord(value) || typeof value.label !== "string" || !Number.isInteger(value.tick)) {
    throw new TypeError(`PAL camera sample ${index} needs a label and integer tick.`);
  }
  const nativeVehicle = value.nativeVehicle;
  const palCamera = value.palCamera;
  if (!isRecord(nativeVehicle) || !isVector3(nativeVehicle.position)
    || !Number.isInteger(nativeVehicle.nativeYaw)
    || !Number.isInteger(nativeVehicle.nativeSlip)
    || !Number.isInteger(nativeVehicle.presetIndex)
    || nativeVehicle.presetIndex < 0 || nativeVehicle.presetIndex > 9
    || (nativeVehicle.resetLag !== undefined && typeof nativeVehicle.resetLag !== "boolean")) {
    throw new TypeError(`PAL camera sample ${index} has invalid native vehicle camera inputs.`);
  }
  if (!isRecord(palCamera) || !isVector3(palCamera.position) || !isVector3(palCamera.target)) {
    throw new TypeError(`PAL camera sample ${index} has an invalid palCamera.`);
  }
  return {
    label: value.label,
    tick: value.tick,
    nativeVehicle: {
      position: nativeVehicle.position,
      nativeYaw: nativeVehicle.nativeYaw,
      nativeSlip: nativeVehicle.nativeSlip,
      presetIndex: nativeVehicle.presetIndex,
      ...(nativeVehicle.resetLag === undefined ? {} : { resetLag: nativeVehicle.resetLag }),
    },
    palCamera: {
      position: palCamera.position,
      target: palCamera.target,
    },
  };
}

function vector3(values: readonly number[]): DrivingValidationVector {
  const x = values[0], y = values[1], z = values[2];
  if (x === undefined || y === undefined || z === undefined) {
    throw new RangeError("Driving validation vector requires at least three components.");
  }
  return [x, y, z];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isFiniteNonNegative(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isVector3(value: unknown): value is DrivingValidationVector {
  return Array.isArray(value)
    && value.length === 3
    && value.every((component) => typeof component === "number" && Number.isFinite(component));
}
