import { describe, expect, test } from "vitest";
import type { RaceActivityDescriptor, RaceCatalogue } from "../formats/raceCatalogue";
import type { RecoveredDialogueStateSave } from "../game/dialogueProgress";
import { nativeUnfinishedRaceIndex } from "../game/raceProgress";
import { RecoveredProgressStore, type RecoveredProgressStoreIo } from "./recoveredProgressStore";

const directory = {} as FileSystemDirectoryHandle;

function activity(activityId: number, variantId: number): RaceActivityDescriptor {
  return {
    activityId,
    name: activityId === 1 ? "Peach Raceway II" : `Race ${activityId}`,
    ordinaryRace: true,
    descriptorAddress: 0,
    sceneId: activityId === 1 ? 0 : activityId,
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
function catalogue(): RaceCatalogue {
  // Activity 1 is PAL class B. Keep a second incomplete class-B race so this
  // regression tests persistence without manufacturing a licence promotion.
  const ordinaryRaces = Array.from({ length: 24 }, (_, activityId) =>
    activity(activityId, activityId === 1 || activityId === 4 ? 1 : 3));
  return { ordinaryRaces, activities: ordinaryRaces, selectorRanges: [] };
}

describe("ordinary race reward persistence loop", () => {
  test("persists Peach Raceway II Cake and best finish through the production save schema", async () => {
    let saved: RecoveredDialogueStateSave | undefined;
    const io: RecoveredProgressStoreIo = {
      read: async () => {
        if (!saved) throw new DOMException("missing", "NotFoundError");
        return saved;
      },
      write: async (_directory, _path, value) => { saved = value as RecoveredDialogueStateSave; },
    };
    const first = await RecoveredProgressStore.restore(directory, io);
    const finishes = Array<number>(24).fill(nativeUnfinishedRaceIndex);
    expect(first.raceState.restore(1, finishes)).toBe(true);

    const result = first.raceState.completeOrdinaryRace(catalogue(), 1, [0], first.commerceState);
    expect(result).toMatchObject({ status: "completed", activityId: 1, prizeCake: 1_500, cakeBefore: 1_000, cakeAfter: 2_500, bestFinishIndex: 0, licenseAfter: 1 });
    first.queueSave();
    await first.flush();
    expect(saved).toMatchObject({
      schemaVersion: 10,
      cake: 2_500,
      raceLicenseClass: 1,
    });
    expect(saved?.ordinaryRaceFinishIndices[1]).toBe(0);

    const restored = await RecoveredProgressStore.restore(directory, io);
    expect(restored.commerceState.cake).toBe(2_500);
    expect(restored.raceState.licenseClass).toBe(1);
    expect(restored.raceState.finishIndex(1)).toBe(0);
    restored.queueSave();
    await restored.flush();
    expect(saved?.cake).toBe(2_500);
  });
});
