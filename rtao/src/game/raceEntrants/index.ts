import {
  ordinaryRaceEntrants,
  type OrdinaryRaceEntrant,
  type RaceActivityDescriptor,
  type RaceNavigationCourse,
  type RaceStartAnchor,
  type RaceTeamMemberIdentity,
} from "../../formats/raceCatalogue";
import {
  stepOrdinaryRaceAi,
  type NativeRaceAiMemory,
  type NativeRaceAiOutput,
} from "../raceAi";
import {
  nativeRacePositions,
  type NativeRacePositionCar,
} from "../racePositions";
import {
  advanceNativeRaceCountdown,
  type NativeRaceCountdownInput,
  type NativeRaceCountdownOutput,
} from "../raceScheduling";

export interface OrdinaryRaceEntrantInitialCommand {
  readonly entrant: OrdinaryRaceEntrant;
  readonly carIndex: number;
  readonly startIndex: number;
  readonly packedCreationFlags: number;
  readonly configPointerIndex: number;
  readonly controlSource: "human-input" | "ordinary-ai";
  readonly controllerIndex: 0 | null;
  readonly nativePlacement: OrdinaryRaceEntrant["seed"];
}

export interface OrdinaryRaceAiRuntimeInput {
  readonly carIndex: number;
  readonly nativeX: number;
  readonly nativeZ: number;
  readonly nativeYaw: number;
  readonly nativeSpeed: number;
  readonly currentRecordIndex: number;
  readonly steeringEnabled: boolean;
  readonly speedLimit: number;
  /** Dispatcher a3. Callers must supply the recovered per-car choice. */
  readonly updateSpeedFeedback: boolean;
  readonly memory: NativeRaceAiMemory;
}

export interface OrdinaryRaceHumanCommand {
  readonly kind: "human-input";
  readonly carIndex: number;
  readonly controllerIndex: 0;
}

export interface OrdinaryRaceAiCommand {
  readonly kind: "ordinary-ai";
  readonly carIndex: number;
  readonly output: NativeRaceAiOutput;
}
export type OrdinaryRaceRuntimeCommand = OrdinaryRaceHumanCommand | OrdinaryRaceAiCommand;

export interface OrdinaryRaceRuntimeFrameInput {
  readonly countdown: NativeRaceCountdownInput;
  readonly aiCars: readonly OrdinaryRaceAiRuntimeInput[];
  readonly positionCars: readonly NativeRacePositionCar[];
  readonly finishCount: number;
}

export interface OrdinaryRaceRuntimeFrameOutput {
  readonly countdown: NativeRaceCountdownOutput;
  readonly commands: readonly OrdinaryRaceRuntimeCommand[];
  readonly positions: readonly { carIndex: number; positionIndex: number }[];
}

/**
 * Adapts the executable-backed entrant builder into session-facing creation
 * commands without changing roster order, flags, ownership, or start seeds.
 */
export function createOrdinaryRaceEntrantInitialCommands(
  activity: RaceActivityDescriptor,
  anchor: RaceStartAnchor,
  teamMembers: readonly (RaceTeamMemberIdentity | undefined)[] = [],
): readonly OrdinaryRaceEntrantInitialCommand[] {
  return ordinaryRaceEntrants(activity, anchor, teamMembers).map((entrant) => ({
    entrant,
    carIndex: entrant.carIndex,
    startIndex: entrant.startIndex,
    packedCreationFlags: entrant.packedCreationFlags,
    configPointerIndex: entrant.configPointerIndex,
    controlSource: entrant.controlSource,
    controllerIndex: entrant.controllerIndex,
    nativePlacement: entrant.seed,
  }));
}

/**
 * Produces one native-scheduled runtime frame. Navigation/AI and live ordering
 * remain delegated to their recovered implementations. Human input is only
 * routed here because its command-mask producer belongs to a different seam.
 */
export function advanceOrdinaryRaceEntrantFrame(
  course: RaceNavigationCourse,
  initialCommands: readonly OrdinaryRaceEntrantInitialCommand[],
  input: OrdinaryRaceRuntimeFrameInput,
): OrdinaryRaceRuntimeFrameOutput {
  if (initialCommands.some((command) => command.nativePlacement.courseId !== course.courseId)) {
    throw new Error("Ordinary race entrants and navigation course do not match.");
  }
  const countdown = advanceNativeRaceCountdown(input.countdown);
  const aiByCar = new Map(input.aiCars.map((car) => [car.carIndex, car] as const));
  if (aiByCar.size !== input.aiCars.length) throw new RangeError("Duplicate ordinary race AI car runtime input.");

  const commands = initialCommands.map((initial): OrdinaryRaceRuntimeCommand => {
    if (initial.controlSource === "human-input") {
      if (initial.controllerIndex !== 0) throw new Error("PAL ordinary player must remain on controller 0.");
      return { kind: "human-input", carIndex: initial.carIndex, controllerIndex: 0 };
    }
    const runtime = aiByCar.get(initial.carIndex);
    if (!runtime) throw new Error(`Missing runtime input for ordinary AI car ${initial.carIndex}.`);
    const output = stepOrdinaryRaceAi(
      course,
      {
        nativeX: runtime.nativeX,
        nativeZ: runtime.nativeZ,
        nativeYaw: runtime.nativeYaw,
        nativeSpeed: runtime.nativeSpeed,
        configPointerIndex: initial.configPointerIndex,
        currentRecordIndex: runtime.currentRecordIndex,
        steeringEnabled: runtime.steeringEnabled,
        speedLimit: runtime.speedLimit,
      },
      {
        sceneFlags: countdown.sceneFlags,
        updateSpeedFeedback: runtime.updateSpeedFeedback,
      },
      runtime.memory,
    );
    return { kind: "ordinary-ai", carIndex: initial.carIndex, output };
  });

  const expectedAiCars = initialCommands.filter((command) => command.controlSource === "ordinary-ai").length;
  if (aiByCar.size !== expectedAiCars) {
    throw new RangeError("Ordinary race AI runtime input does not match the entrant field.");
  }
  return {
    countdown,
    commands,
    positions: nativeRacePositions(input.positionCars, input.finishCount),
  };
}
