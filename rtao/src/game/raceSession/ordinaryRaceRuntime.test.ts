import { describe, expect, test } from "vitest";
import type { RaceActivityDescriptor, RaceCatalogue } from "../../formats/raceCatalogue";
import { resolveOrdinaryRaceRuntimeSelection } from "./ordinaryRaceRuntime";

function activity(activityId: number, sceneId: number, name: string): RaceActivityDescriptor {
  return {
    activityId,
    name,
    ordinaryRace: true,
    descriptorAddress: 0,
    sceneId,
    rawParameter1: 24,
    rawParameter2: 3,
    variantId: activityId,
    settingsAddress: 1,
    participantListAddress: 1,
    participants: [],
    rawSettings: new Uint8Array(20),
    handlerAAddress: 0,
    handlerBAddress: 0,
  };
}

const races = [
  activity(0, 0, "Peach Raceway"),
  activity(1, 0, "Peach Raceway II"),
  activity(2, 1, "Temple Raceway"),
];

const catalogue: RaceCatalogue = {
  ordinaryRaces: races,
  activities: races,
  selectorRanges: [],
};

describe("ordinary race runtime selection", () => {
  test("resolves course data through sceneId rather than activityId", () => {
    expect(resolveOrdinaryRaceRuntimeSelection(catalogue, 1)).toMatchObject({
      courseId: 0,
      activity: { name: "Peach Raceway II" },
    });
    expect(resolveOrdinaryRaceRuntimeSelection(catalogue, 2)).toMatchObject({
      courseId: 1,
      activity: { name: "Temple Raceway" },
    });
  });

  test("rejects activity IDs outside the recovered ordinary range", () => {
    expect(() => resolveOrdinaryRaceRuntimeSelection(catalogue, 3)).toThrow(/outside/);
  });
});
