import type { RaceCameraPose, RacePose, RaceView } from "../raceView";
import { stepOrdinaryRaceAi, type NativeRaceAiMemory } from "../raceAi";
import type { OrdinaryRaceSessionCarView, OrdinaryRaceSessionStepResult } from "./raceSession";
import type { PeachRaceRuntime } from "./peachRaceRuntime";

const tau = Math.PI * 2;

interface AiRuntimeState {
  currentRecordIndex: number;
  readonly memory: NativeRaceAiMemory;
}

export interface PeachRaceCoordinatorStepInput {
  readonly sceneTime: number;
  readonly playerCommands: number;
  readonly shortFinalPhase?: boolean;
}

export interface PeachRaceCoordinatorStepResult {
  readonly session: OrdinaryRaceSessionStepResult;
  readonly poses: readonly { carIndex: number; pose: RacePose }[];
}
export function peachRaceEntrantId(carIndex: number): string {
  if (!Number.isInteger(carIndex) || carIndex < 0 || carIndex > 23) {
    throw new RangeError("Peach race entrant ID requires a native car slot 0..23.");
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

export function peachRaceChaseCamera(pose: RacePose): RaceCameraPose {
  const [x, y, z] = pose.position;
  const forwardX = Math.sin(pose.yaw);
  const forwardZ = Math.cos(pose.yaw);
  return {
    position: [x - forwardX * 10, y + 4.8, z - forwardZ * 10],
    target: [x + forwardX * 16, y + 1, z + forwardZ * 16],
  };
}
export class PeachRaceCoordinator {
  private readonly ai = new Map<number, AiRuntimeState>();

  constructor(readonly runtime: PeachRaceRuntime) {
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
  }

  step(input: PeachRaceCoordinatorStepInput): PeachRaceCoordinatorStepResult {
    if (!Number.isInteger(input.playerCommands) || (input.playerCommands | 0) !== input.playerCommands) {
      throw new RangeError("Peach race player commands must retain a signed 32-bit native mask.");
    }
    const session = this.runtime.session.step({
      sceneTime: input.sceneTime,
      shortFinalPhase: input.shortFinalPhase ?? false,
      commandSource: (car) => this.commandFor(car, input.playerCommands),
    });
    return { session, poses: this.poses() };
  }
  syncView(view: RaceView): void {
    const poses = this.poses();
    for (const { carIndex, pose } of poses) {
      view.entrants.updatePose(peachRaceEntrantId(carIndex), pose);
    }
    const player = poses.find((entry) => entry.carIndex === 0);
    if (!player) throw new Error("Peach race presentation has no player car 0.");
    view.setCameraPose(peachRaceChaseCamera(player.pose));
    view.renderOnce();
  }

  poses(): readonly { carIndex: number; pose: RacePose }[] {
    return this.runtime.initialCommands.map(({ carIndex }) => ({
      carIndex,
      pose: racePoseFromSessionCar(this.runtime.session.entrant(carIndex)),
    }));
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
