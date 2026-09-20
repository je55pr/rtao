import { describe, expect, test } from "vitest";
import { DialogueRuntimeState } from "../formats/dialogue";
import { RecoveredCommerceState } from "../game/commerceProgress";
import { developmentPartCatalogue, knownNativePartCoordinate, partCategoryOrder } from "../game/parts";
import { grantAllDebugParts, setDebugCake, unlockAllDebugWarps } from "./debugCheats";

describe("developer debug cheats", () => {
  test("sets the requested Cake balance through normal commerce mutations", () => {
    const commerce = new RecoveredCommerceState(1_000);
    expect(setDebugCake(commerce)).toBe(true);
    expect(commerce.cake).toBe(100_000);
    expect(setDebugCake(commerce)).toBe(true);
    expect(commerce.cake).toBe(100_000);
  });

  test("grants one copy of every mapped nonzero native part", () => {
    const state = new DialogueRuntimeState();
    const granted = grantAllDebugParts(state);
    let expected = 0;
    for (const category of partCategoryOrder) {
      for (const definition of developmentPartCatalogue[category]) {
        const coordinate = knownNativePartCoordinate(definition);
        if (!coordinate || coordinate.nativeItemIndex === 0) continue;
        expected += 1;
        expect(state.indexedFlagCount(coordinate.nativeCategory, coordinate.nativeItemIndex)).toBe(1);
      }
    }
    expect(granted).toBe(expected);
    expect(grantAllDebugParts(state)).toBe(0);
  });

  test("registers all nine city Warp destinations without duplicating them", () => {
    const state = new DialogueRuntimeState();
    expect(unlockAllDebugWarps(state)).toBe(9);
    expect(state.warpRegistrationEntries()).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(unlockAllDebugWarps(state)).toBe(0);
  });
});
