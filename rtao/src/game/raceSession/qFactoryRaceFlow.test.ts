import { describe, expect, test } from "vitest";
import { DialogueActionOpcode, type DialogueActionToken } from "../../formats/dialogue";
import type { RaceActivityDescriptor, RaceCatalogue } from "../../formats/raceCatalogue";
import { RecoveredCommerceState } from "../commerceProgress";
import { nativeUnfinishedRaceIndex, RecoveredRaceState } from "../raceProgress";
import {
  qFactoryRaceLaunchActivityId,
  qFactoryRaceOptions,
  qFactoryRaceSelectionTargets,
} from "./qFactoryRaceFlow";

function activity(activityId: number, variantId: number, ordinaryRace = true): RaceActivityDescriptor {
  return {
    activityId,
    name: `Race ${activityId}`,
    ordinaryRace,
    descriptorAddress: 0,
    sceneId: activityId,
    rawParameter1: 24,
    rawParameter2: 3,
    variantId,
    settingsAddress: 1,
    participantListAddress: 1,
    participants: [],
    rawSettings: new Uint8Array(20),
    handlerAAddress: 0,
    handlerBAddress: 0,
  };
}

function action(opcode: DialogueActionOpcode, operands: number[]): DialogueActionToken {
  return { kind: "action", offset: 0, opcode, operands: new Uint8Array(operands) };
}

describe("Q's Factory race flow", () => {
  test("preserves the recovered selected and cancel dialogue targets", () => {
    expect(qFactoryRaceSelectionTargets(action(DialogueActionOpcode.RaceSelect, [15, 4]))).toEqual({
      selectedTarget: 15,
      cancelTarget: 4,
    });
  });

  test("uses the executable area selector range and gates launch support independently", () => {
    const activities = [activity(0, 0), activity(1, 1), activity(2, 0)];
    const catalogue: RaceCatalogue = {
      ordinaryRaces: activities,
      activities,
      selectorRanges: [{ areaIndex: 0, firstActivityId: 0, activityCount: 0 }, { areaIndex: 1, firstActivityId: 0, activityCount: 3 }],
    };
    const options = qFactoryRaceOptions(catalogue, new RecoveredRaceState(), 1);
    expect(options.map((option) => [option.activity.activityId, option.unlocked, option.completedTopSix])).toEqual([
      [0, true, false],
      [1, false, false],
      [2, true, false],
    ]);
  });

  test("recomputes class availability immediately after a best-result promotion", () => {
    const activities = [activity(0, 0), activity(1, 1)];
    const catalogue: RaceCatalogue = { ordinaryRaces: activities, activities, selectorRanges: [
      { areaIndex: 0, firstActivityId: 0, activityCount: 0 }, { areaIndex: 1, firstActivityId: 0, activityCount: 2 },
    ] };
    const races = new RecoveredRaceState();
    expect(qFactoryRaceOptions(catalogue, races, 1).map((option) => option.unlocked)).toEqual([true, false]);
    races.completeOrdinaryRace(catalogue, 0, [5], new RecoveredCommerceState());
    const options = qFactoryRaceOptions(catalogue, races, 1);
    expect(options.map((option) => [option.unlocked, option.bestFinishIndex, option.completedTopSix])).toEqual([[true, 5, true], [true, nativeUnfinishedRaceIndex, false]]);
  });

  test("resolves action-03 zero through current selection and preserves explicit activity IDs", () => {
    expect(qFactoryRaceLaunchActivityId(action(DialogueActionOpcode.StartRace, [0]), 0)).toBe(0);
    expect(qFactoryRaceLaunchActivityId(action(DialogueActionOpcode.StartRace, [28]), undefined)).toBe(28);
    expect(() => qFactoryRaceLaunchActivityId(action(DialogueActionOpcode.StartRace, [0]), undefined)).toThrow(/no selected activity/);
  });
});
