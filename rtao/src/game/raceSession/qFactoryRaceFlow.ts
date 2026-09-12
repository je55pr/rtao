import type { DialogueActionToken } from "../../formats/dialogue";
import { raceActivitiesForArea, type RaceActivityDescriptor, type RaceCatalogue } from "../../formats/raceCatalogue";
import type { RecoveredRaceState } from "../raceProgress";

const raceSelectOpcode = 0x08;
const startRaceOpcode = 0x03;

export interface QFactoryRaceOption {
  readonly activity: RaceActivityDescriptor;
  readonly unlocked: boolean;
  readonly bestFinishIndex: number;
  readonly completedTopSix: boolean;
}

export function qFactoryRaceSelectionTargets(action: DialogueActionToken): {
  readonly selectedTarget: number;
  readonly cancelTarget: number;
} {
  if (action.opcode !== raceSelectOpcode || action.operands.length < 2) {
    throw new Error("Q's Factory race selection requires the recovered two-target action 0x08.");
  }
  return { selectedTarget: action.operands[0]!, cancelTarget: action.operands[1]! };
}

export function qFactoryRaceOptions(
  catalogue: RaceCatalogue,
  races: RecoveredRaceState,
  areaIndex: number,
): readonly QFactoryRaceOption[] {
  return raceActivitiesForArea(catalogue, areaIndex).map((activity) => {
    const unlocked = races.isUnlocked(activity);
    const bestFinishIndex = races.finishIndex(activity.activityId);
    return { activity, unlocked, bestFinishIndex, completedTopSix: bestFinishIndex < 6 };
  });
}

export function qFactoryRaceLaunchActivityId(
  action: DialogueActionToken,
  selectedActivityId: number | undefined,
): number {
  if (action.opcode !== startRaceOpcode || action.operands.length < 1) {
    throw new Error("Q's Factory race launch requires action 0x03 with its activity selector operand.");
  }
  const explicitActivityId = action.operands[0]!;
  if (explicitActivityId !== 0) return explicitActivityId;
  if (selectedActivityId === undefined) {
    throw new Error("Q's Factory current-race launch has no selected activity.");
  }
  return selectedActivityId;
}
