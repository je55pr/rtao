import {
  readRaceCatalogue,
  readRaceFinishGateSets,
  readRaceNavigationCourses,
  readRaceStartAnchors,
} from "../../formats/raceCatalogue";
import type { RaceActivityDescriptor, RaceCatalogue } from "../../formats/raceCatalogue";
import type { CompiledFieldCollision } from "../../formats/fieldCollision";
import { NativeRaceCollisionSampler } from "../nativeRaceCollision";
import { readNativeRaceFrameData } from "../nativeRaceFrame";
import { readNativeRaceObstaclePoints } from "../nativeRaceObstacle";
import {
  ordinaryRaceOpponentEquipment,
  readNativeRaceEquipment,
} from "../nativeRaceVehicle";
import { RaceCourseGridSampler } from "../raceCourseGrid";
import { readOrdinaryRaceSpeedProfiles } from "../raceAi";
import { createOrdinaryRaceEntrantInitialCommands } from "../raceEntrants";
import {
  createOrdinaryRaceInitialFrameState,
  OrdinaryRaceSession,
  type OrdinaryRaceCountdownSeed,
} from "./raceSession";

export interface OrdinaryRaceRuntimeSceneSeed {
  readonly countdown: OrdinaryRaceCountdownSeed;
  readonly sceneKind: number;
  readonly sceneByte0B: number;
  readonly raceModeByte: number;
  readonly playerEquipmentFlags: number;
  readonly globalEquipmentFlags: number;
}
export interface OrdinaryRaceRuntimeInput extends OrdinaryRaceRuntimeSceneSeed {
  readonly activityId: number;
  readonly executable: Uint8Array;
  readonly courseBytes: Uint8Array;
  readonly compiledCollision: CompiledFieldCollision;
  readonly playerEquipmentSelectors: readonly number[];
}

export interface OrdinaryRaceRuntime {
  readonly activityId: number;
  readonly activityName: string;
  readonly courseId: number;
  readonly session: OrdinaryRaceSession;
  readonly initialCommands: ReturnType<typeof createOrdinaryRaceEntrantInitialCommands>;
  readonly navigation: ReturnType<typeof readRaceNavigationCourses>[number];
  readonly speedProfile: Uint8Array;
}

export interface OrdinaryRaceRuntimeSelection {
  readonly activity: RaceActivityDescriptor;
  readonly courseId: number;
}

export function resolveOrdinaryRaceRuntimeSelection(
  catalogue: RaceCatalogue,
  activityId: number,
): OrdinaryRaceRuntimeSelection {
  if (!Number.isInteger(activityId) || activityId < 0 || activityId >= catalogue.ordinaryRaces.length) {
    throw new RangeError(`Ordinary race activity ${activityId} lies outside the executable-backed ordinary range.`);
  }
  const activity = catalogue.ordinaryRaces[activityId];
  if (!activity || activity.activityId !== activityId) {
    throw new Error(`PAL ordinary activity ${activityId} metadata is incomplete.`);
  }
  return { activity, courseId: activity.sceneId };
}

export function createOrdinaryRaceRuntime(input: OrdinaryRaceRuntimeInput): OrdinaryRaceRuntime {
  const catalogue = readRaceCatalogue(input.executable);
  const { activity, courseId } = resolveOrdinaryRaceRuntimeSelection(catalogue, input.activityId);
  const anchor = readRaceStartAnchors(input.executable)[courseId];
  const finishGates = readRaceFinishGateSets(input.executable)[courseId];
  const navigation = readRaceNavigationCourses(input.executable)[courseId];
  const speedProfile = readOrdinaryRaceSpeedProfiles(input.executable)[input.activityId];
  if (!anchor || !finishGates || !navigation || !speedProfile) {
    throw new Error(
      `PAL ordinary activity ${input.activityId} / COURSE/C${courseId.toString().padStart(2, "0")} metadata is incomplete.`,
    );
  }

  const initialCommands = createOrdinaryRaceEntrantInitialCommands(activity, anchor);
  const grid = new RaceCourseGridSampler(input.compiledCollision);
  const frameData = readNativeRaceFrameData(input.executable);
  const collision = new NativeRaceCollisionSampler(input.courseBytes);
  const obstaclePoints = readNativeRaceObstaclePoints(input.courseBytes);
  const opponentSetup = ordinaryRaceOpponentEquipment(activity);

  const entrants = initialCommands.map((command) => {
    const grounded = grid.ground(command.nativePlacement);
    const carFlags = command.packedCreationFlags >>> 16;
    const isPlayer = command.controlSource === "human-input";
    const equipmentFlags = isPlayer ? input.playerEquipmentFlags : opponentSetup.equipmentFlags;
    const selectors = isPlayer ? input.playerEquipmentSelectors : opponentSetup.selectors;
    const equipment = readNativeRaceEquipment(input.executable, selectors, carFlags);
    return {
      entrant: command.entrant,
      state: createOrdinaryRaceInitialFrameState({
        entrant: command.entrant,
        groundedNativeY: grounded.position.y,
        positionDivisor: frameData.contact.positionDivisor,
      }),
      equipment: isPlayer ? equipment : { ...equipment, fuelConsumption: 0 },
      equipmentFlags,
      obstaclePoints,
    };
  });

  return {
    activityId: activity.activityId,
    activityName: activity.name,
    courseId,
    session: new OrdinaryRaceSession({
      activity,
      finishGates,
      countdown: input.countdown,
      frameData,
      query: (point) => collision.query(point),
      sceneKind: input.sceneKind,
      sceneByte0B: input.sceneByte0B,
      raceModeByte: input.raceModeByte,
      globalEquipmentFlags: input.globalEquipmentFlags,
      entrants,
    }),
    initialCommands,
    navigation,
    speedProfile: speedProfile.slice(),
  };
}