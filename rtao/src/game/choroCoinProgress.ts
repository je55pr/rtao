import type { ChoroCoinPlacement } from "../formats/choroCoins";
import type { DialogueRuntimeState } from "../formats/dialogue";
import type { Vec3 } from "./worldCollision";

/** PAL constant loaded at 0x002437ec before the native pickup distance test. */
export const CHORO_COIN_PICKUP_RADIUS = 1.4;

export interface ChoroCoinPickup {
  readonly placement: ChoroCoinPlacement;
  readonly collectedCount: number;
}

/** Converts authored field-local X into the reflected browser world coordinates. */
export function choroCoinRenderPosition(placement: ChoroCoinPlacement): Vec3 {
  return {
    x: 1600 - placement.sourcePosition.x,
    y: placement.sourcePosition.y,
    z: placement.sourcePosition.z,
  };
}

/**
 * Mirrors the native index-order pickup scan: same area, still available, then
 * strict 3D distance < 1.4. At most one coin is consumed per scan.
 */
export function collectNearbyChoroCoin(
  state: DialogueRuntimeState,
  placements: readonly ChoroCoinPlacement[],
  fieldNumber: number,
  position: Vec3,
): ChoroCoinPickup | undefined {
  for (const placement of placements) {
    if (placement.fieldNumber !== fieldNumber || state.hasCollectedChoroCoin(placement.index)) continue;
    const coin = choroCoinRenderPosition(placement);
    const distance = Math.hypot(
      position.x - coin.x,
      position.y - coin.y,
      position.z - coin.z,
    );
    if (!(distance < CHORO_COIN_PICKUP_RADIUS)) continue;
    if (!state.collectChoroCoin(placement.index)) continue;
    return { placement, collectedCount: state.choroCoinCollectedCount };
  }
  return undefined;
}
