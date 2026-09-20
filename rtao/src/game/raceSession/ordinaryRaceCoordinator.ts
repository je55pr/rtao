import type { RaceCameraPose, RacePose, RaceView } from "../raceView";
import { advanceNativeChaseCamera } from "../nativeChaseCamera";
import {
  createNativeCameraRuntimeContractState,
  reflectNativeCameraPointX,
  replaceNativeCameraController,
  selectNativeCameraRenderPose,
  type NativeCameraRuntimeContractState,
} from "../nativeCameraRuntimeContract";
import { browserOrdinaryChasePresetIndex } from "../browserChaseCameraSafety";
import { stepOrdinaryRaceAi, type NativeRaceAiMemory } from "../raceAi";
import type { OrdinaryRaceSessionCarView, OrdinaryRaceSessionStepResult } from "./raceSession";
import type { OrdinaryRaceRuntime } from "./ordinaryRaceRuntime";

const tau = Math.PI * 2;

interface AiRuntimeState {
  currentRecordIndex: number;
  readonly memory: NativeRaceAiMemory;
}

export interface OrdinaryRaceCoordinatorStepInput {
  readonly sceneTime: number;
  readonly playerCommands: number;
  readonly shortFinalPhase?: boolean;
}

export interface OrdinaryRaceCoordinatorStepResult {
  readonly session: OrdinaryRaceSessionStepResult;
  readonly poses: readonly { carIndex: number; pose: RacePose }[];
}
export function ordinaryRaceEntrantId(carIndex: number): string {
  if (!Number.isInteger(carIndex) || carIndex < 0 || carIndex > 23) {
    throw new RangeError("Ordinary race entrant ID requires a native car slot 0..23.");
  }
  return `race-car-${carIndex}`;
}

export function racePoseFromSessionCar(car: OrdinaryRaceSessionCarView): RacePose {
  const nativeX = car.state.coordinates[0];
  const nativeY = car.state.coordinates[1];
  const nativeZ = car.state.coordinates[2];
  const nativeYaw = car.state.vehicle.yaw & 0xffff;
  return {
    position: [1600 - nativeX, nativeY, nativeZ],
    yaw: -(nativeYaw / 0x10000) * tau,
  };
}

export function ordinaryRaceChaseCamera(car: OrdinaryRaceSessionCarView): RaceCameraPose {
  const pose = racePoseFromSessionCar(car);
  const [x, y, z] = pose.position;
  const forwardX = Math.sin(pose.yaw);
  const forwardZ = Math.cos(pose.yaw);
  // Host presentation fallback. The retained PAL camera contract proves the
  // preset/yaw inputs, but not that its 0.001 recurrence is final world-space
  // position output. Keep the stable browser framing until a numeric PAL trace
  // closes that output-builder boundary.
  return {
    position: [x - forwardX * 10, y + 4.8, z - forwardZ * 10],
    target: [x + forwardX * 16, y + 1, z + forwardZ * 16],
  };
}
export class OrdinaryRaceCoordinator {
  private readonly ai = new Map<number, AiRuntimeState>();
  private cameraRuntimeState: NativeCameraRuntimeContractState =
    createNativeCameraRuntimeContractState(browserOrdinaryChasePresetIndex);

  constructor(readonly runtime: OrdinaryRaceRuntime) {
    for (const initial of runtime.initialCommands) {
      if (initial.controlSource !== "ordinary-ai") continue;
      this.ai.set(initial.carIndex, {
        // Car +0x24A lies inside the 624-byte memset at 0x219354.
        currentRecordIndex: 0,
        memory: {
          speedTargets: runtime.speedProfile,
          // Car +0x25C is an independent cleared 256-byte feedback buffer.
          speedFeedback: new Uint8Array(256),
        },
      });
    }
    this.advancePlayerCamera();
  }

  step(input: OrdinaryRaceCoordinatorStepInput): OrdinaryRaceCoordinatorStepResult {
    if (!Number.isInteger(input.playerCommands) || (input.playerCommands | 0) !== input.playerCommands) {
      throw new RangeError("Ordinary race player commands must retain a signed 32-bit native mask.");
    }
    const session = this.runtime.session.step({
      sceneTime: input.sceneTime,
      shortFinalPhase: input.shortFinalPhase ?? false,
      commandSource: (car) => this.commandFor(car, input.playerCommands),
    });
    this.advancePlayerCamera();
    return { session, poses: this.poses() };
  }
  syncView(view: RaceView): void {
    const poses = this.poses();
    for (const { carIndex, pose } of poses) {
      view.entrants.updatePose(ordinaryRaceEntrantId(carIndex), pose);
    }
    const player = poses.find((entry) => entry.carIndex === 0);
    if (!player) throw new Error("Ordinary race presentation has no player car 0.");
    const fallback = ordinaryRaceChaseCamera(this.runtime.session.entrant(0));
    const camera = selectNativeCameraRenderPose(
      this.cameraRuntimeState,
      (point) => reflectNativeCameraPointX(point, 1600),
      fallback,
    );
    view.setCameraPose(camera.pose);
    view.renderOnce();
  }

  poses(): readonly { carIndex: number; pose: RacePose }[] {
    return this.runtime.initialCommands.map(({ carIndex }) => ({
      carIndex,
      pose: racePoseFromSessionCar(this.runtime.session.entrant(carIndex)),
    }));
  }

  private advancePlayerCamera(): void {
    const car = this.runtime.session.entrant(0);
    this.cameraRuntimeState = replaceNativeCameraController(
      this.cameraRuntimeState,
      advanceNativeChaseCamera(
        this.cameraRuntimeState.controller,
        {
          // Race simulation coordinates are already PAL/native. Reflection is a
          // renderer concern and must not alter native follow/yaw state.
          position: [
            car.state.coordinates[0],
            car.state.coordinates[1],
            car.state.coordinates[2],
          ],
          nativeYaw: car.state.vehicle.yaw,
          nativeSlip: car.state.vehicle.slipAngle,
        },
      ),
    );
  }

  private commandFor(car: OrdinaryRaceSessionCarView, playerCommands: number) {
    if (car.entrant.controlSource === "human-input") {
      if (car.entrant.carIndex !== 0 || car.entrant.controllerIndex !== 0) {
        throw new Error("PAL ordinary player command ownership drifted from controller 0 / car 0.");
      }
      return { commands: playerCommands };
    }
    const state = this.ai.get(car.entrant.carIndex);
    if (!state) throw new Error(`Missing ordinary AI runtime state for car ${car.entrant.carIndex}.`);
    const output = stepOrdinaryRaceAi(
      this.runtime.navigation,
      {
        nativeX: car.state.coordinates[0],
        nativeZ: car.state.coordinates[2],
        nativeYaw: car.state.vehicle.yaw & 0xffff,
        nativeSpeed: car.state.vehicle.nativeSpeed,
        configPointerIndex: car.entrant.configPointerIndex,
        currentRecordIndex: state.currentRecordIndex,
        steeringEnabled: true,
        speedLimit: car.speedLimit,
      },
      { sceneFlags: this.runtime.session.currentSceneFlags, updateSpeedFeedback: false },
      state.memory,
    );
    state.currentRecordIndex = output.currentRecordIndex;
    return {
      commands: output.commandMask,
      nativeYaw: output.nativeYaw,
    };
  }
}
