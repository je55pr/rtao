import { describe, expect, test } from "vitest";
import type { RaceActivityDescriptor, RaceCatalogue, RaceFinishGateSet } from "../formats/raceCatalogue";
import { RecoveredCommerceState } from "./commerceProgress";
import { advanceNativeRaceFinishGate, nativeUnfinishedRaceIndex, RecoveredRaceState } from "./raceProgress";

describe("recovered ordinary-race progress", () => {
  test("credits the exact team prize, keeps the best finish, and respects the Cake cap", () => {
    const catalogue = syntheticCatalogue([0]);
    const races = new RecoveredRaceState();
    const commerce = new RecoveredCommerceState(1_000);
    expect(races.completeOrdinaryRace(catalogue, 0, [1, 3, 0xff], commerce)).toMatchObject({
      status: "completed", prizeCake: 800, cakeBefore: 1_000, cakeAfter: 1_800,
      previousBestFinishIndex: 0xff, bestFinishIndex: 1,
    });
    expect(races.completeOrdinaryRace(catalogue, 0, [4], commerce)).toMatchObject({
      prizeCake: 200, previousBestFinishIndex: 1, bestFinishIndex: 1,
    });
    const capped = new RecoveredCommerceState(999_900);
    races.completeOrdinaryRace(catalogue, 0, [0], capped);
    expect(capped.cake).toBe(999_999);
  });

  test("promotes only after every race in the current class has a top-six player finish", () => {
    const catalogue = syntheticCatalogue([0, 0, 1]);
    const races = new RecoveredRaceState();
    const commerce = new RecoveredCommerceState();
    expect(races.completeOrdinaryRace(catalogue, 0, [5], commerce).promoted).toBe(false);
    expect(races.completeOrdinaryRace(catalogue, 1, [6], commerce).promoted).toBe(false);
    const promotion = races.completeOrdinaryRace(catalogue, 1, [4], commerce);
    expect(promotion).toMatchObject({ promoted: true, licenseBefore: 0, licenseAfter: 1 });
    expect(races.finishEntries().slice(0, 3)).toEqual([5, 4, 0xff]);
  });

  test("rejects locked and non-race activities without changing progress or Cake", () => {
    const catalogue = syntheticCatalogue([0, 1]);
    const races = new RecoveredRaceState();
    const commerce = new RecoveredCommerceState(1_000);
    expect(races.completeOrdinaryRace(catalogue, 1, [0], commerce).status).toBe("locked");
    expect(races.completeOrdinaryRace(catalogue, 24, [0], commerce).status).toBe("not-an-ordinary-race");
    expect(commerce.cake).toBe(1_000);
    expect(races.revision).toBe(0);
  });

  test("round-trips native-width licence/result fields without a fake revision", () => {
    const races = new RecoveredRaceState();
    const values = Array<number>(24).fill(nativeUnfinishedRaceIndex);
    values[0] = 2;
    expect(races.restore(2, values)).toBe(true);
    expect(races.licenseClass).toBe(2);
    expect(races.finishIndex(0)).toBe(2);
    expect(races.revision).toBe(0);
    expect(races.restore(4, values)).toBe(false);
    expect(races.restore(2, values.slice(1))).toBe(false);
  });

  test("requires the native three-strip sequence before reporting a completed lap", () => {
    const gates: RaceFinishGateSet = { courseId: 0, strips: [
      { minimumX: 0, minimumZ: 0, maximumX: 2, maximumZ: 10 },
      { minimumX: 2, minimumZ: 0, maximumX: 4, maximumZ: 10 },
      { minimumX: 4, minimumZ: 0, maximumX: 6, maximumZ: 10 },
    ] };
    let phase = 1;
    ({ phase } = advanceNativeRaceFinishGate(gates, phase, 1, 5));
    expect(phase).toBe(2);
    ({ phase } = advanceNativeRaceFinishGate(gates, phase, 3, 5));
    expect(phase).toBe(3);
    ({ phase } = advanceNativeRaceFinishGate(gates, phase, 5, 5));
    expect(phase).toBe(4);
    expect(advanceNativeRaceFinishGate(gates, phase, 1, 5)).toEqual({ phase: 2, completedLap: true });

    expect(advanceNativeRaceFinishGate(gates, 1, 5, 5)).toEqual({ phase: 1, completedLap: false });
    expect(advanceNativeRaceFinishGate(gates, 2, 20, 20)).toEqual({ phase: 1, completedLap: false });
    expect(advanceNativeRaceFinishGate(gates, 0, 20, 20)).toEqual({ phase: 0, completedLap: false });
    expect(advanceNativeRaceFinishGate(gates, 0, 1, 5)).toEqual({ phase: 2, completedLap: false });
    expect(() => advanceNativeRaceFinishGate(gates, -1, 1, 5)).toThrow(/0\.\.4/);
  });
});

function syntheticCatalogue(variants: readonly number[]): RaceCatalogue {
  const ordinaryRaces = Array.from({ length: 24 }, (_, activityId) => activity(activityId, variants[activityId] ?? 3, true));
  const activities = [...ordinaryRaces, activity(24, 4, false)];
  return { ordinaryRaces, activities, selectorRanges: [] };
}

function activity(activityId: number, variantId: number, ordinaryRace: boolean): RaceActivityDescriptor {
  return {
    activityId, name: `Race ${activityId}`, ordinaryRace, descriptorAddress: 0, sceneId: activityId,
    rawParameter1: 24, rawParameter2: 3, variantId, settingsAddress: 1, participantListAddress: 1,
    participants: [], rawSettings: new Uint8Array(20), handlerAAddress: 0, handlerBAddress: 0,
  };
}
