import type { CompiledFieldCollision } from "../../formats/fieldCollision";
import {
  readRaceCatalogue,
  readRaceFinishGateSets,
  readRaceNavigationCourses,
  readRaceStartAnchors,
} from "../../formats/raceCatalogue";
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
export interface PeachRaceRuntimeSceneSeed {
  readonly countdown: OrdinaryRaceCountdownSeed;
  readonly sceneKind: number;
  readonly sceneByte0B: number;
  readonly raceModeByte: number;
  readonly playerEquipmentFlags: number;
  readonly globalEquipmentFlags: number;
}

export interface PeachRaceRuntimeInput extends PeachRaceRuntimeSceneSeed {
  readonly executable: Uint8Array;
  readonly courseBytes: Uint8Array;
  readonly compiledCollision: CompiledFieldCollision;
  readonly playerEquipmentSelectors: readonly number[];
}

export interface PeachRaceRuntime {
  readonly session: OrdinaryRaceSession;
  readonly initialCommands: ReturnType<typeof createOrdinaryRaceEntrantInitialCommands>;
  readonly navigation: ReturnType<typeof readRaceNavigationCourses>[number];
  readonly speedProfile: Uint8Array;
}
export function createPeachRaceRuntime(input: PeachRaceRuntimeInput): PeachRaceRuntime {
  const catalogue = readRaceCatalogue(input.executable);
  const activity = catalogue.ordinaryRaces[0];
  const anchor = readRaceStartAnchors(input.executable)[0];
  const finishGates = readRaceFinishGateSets(input.executable)[0];
  const navigation = readRaceNavigationCourses(input.executable)[0];
  const speedProfile = readOrdinaryRaceSpeedProfiles(input.executable)[0];
  if (!activity || activity.activityId !== 0 || activity.sceneId !== 0 || !anchor || !finishGates || !navigation || !speedProfile) {
    throw new Error("PAL Peach Raceway activity 0 / COURSE/C00 metadata is incomplete.");
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
