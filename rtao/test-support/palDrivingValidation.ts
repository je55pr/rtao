import {
  advanceBrowserChaseCamera,
  type BrowserChaseCameraState,
} from "../src/game/browserChaseCamera";
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
  readonly browserPose: {
    readonly position: DrivingValidationVector;
    readonly yaw: number;
    readonly cameraLift: number;
    readonly snap?: boolean;
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

export function browserCameraObservations(trace: PalCameraTrace): DrivingCameraObservation[] {
  let state: BrowserChaseCameraState = {
    position: [0, 0, 0],
    target: [0, 0, 0],
    ready: false,
  };
  return trace.samples.map((sample) => {
    state = advanceBrowserChaseCamera(
      state,
      {
        position: sample.browserPose.position,
        yaw: sample.browserPose.yaw,
        cameraLift: sample.browserPose.cameraLift,
      },
      sample.browserPose.snap ?? false,
    );
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
  const browserPose = value.browserPose;
  const palCamera = value.palCamera;
  if (!isRecord(browserPose) || !isVector3(browserPose.position)
    || typeof browserPose.yaw !== "number" || !Number.isFinite(browserPose.yaw)
    || !isFiniteNonNegative(browserPose.cameraLift)
    || (browserPose.snap !== undefined && typeof browserPose.snap !== "boolean")) {
    throw new TypeError(`PAL camera sample ${index} has an invalid browserPose.`);
  }
  if (!isRecord(palCamera) || !isVector3(palCamera.position) || !isVector3(palCamera.target)) {
    throw new TypeError(`PAL camera sample ${index} has an invalid palCamera.`);
  }
  return {
    label: value.label,
    tick: value.tick,
    browserPose: {
      position: browserPose.position,
      yaw: browserPose.yaw,
      cameraLift: browserPose.cameraLift,
      ...(browserPose.snap === undefined ? {} : { snap: browserPose.snap }),
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
