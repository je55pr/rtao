import type { DialogueRuntimeState } from "../formats/dialogue";
import type { RecoveredCommerceState } from "../game/commerceProgress";
import { developmentPartCatalogue, knownNativePartCoordinate, partCategoryOrder } from "../game/parts";

export interface DebugOwnershipState {
  indexedFlagCount(namespace: number, index: number): number;
  setIndexedFlag(namespace: number, index: number): boolean;
}

export function setDebugCake(commerce: RecoveredCommerceState, cake = 100_000): boolean {
  if (!Number.isInteger(cake) || cake < 0 || cake > 999_999) throw new RangeError("Debug Cake must be 0..999999.");
  return commerce.applyCakeMutation(commerce.cake - cake);
}

export function grantAllDebugParts(ownership: DebugOwnershipState): number {
  let granted = 0;
  for (const category of partCategoryOrder) {
    for (const definition of developmentPartCatalogue[category]) {
      const coordinate = knownNativePartCoordinate(definition);
      if (!coordinate || coordinate.nativeItemIndex === 0) continue;
      if (ownership.indexedFlagCount(coordinate.nativeCategory, coordinate.nativeItemIndex) > 0) continue;
      if (ownership.setIndexedFlag(coordinate.nativeCategory, coordinate.nativeItemIndex)) granted += 1;
    }
  }
  return granted;
}

export function unlockAllDebugWarps(state: Pick<DialogueRuntimeState, "hasWarpRegistration" | "registerWarpArea">): number {
  let unlocked = 0;
  for (let areaIndex = 1; areaIndex <= 9; areaIndex += 1) {
    if (state.hasWarpRegistration(areaIndex)) continue;
    if (state.registerWarpArea(areaIndex)) unlocked += 1;
  }
  return unlocked;
}
