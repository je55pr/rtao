import { describe, expect, test } from "vitest";
import { DialogueRuntimeState } from "../formats/dialogue";
import { purchaseIndexedItem, RecoveredCommerceState } from "./commerceProgress";
import { createRecoveredDialogueStateSave, restoreRecoveredDialogueStateSave } from "./dialogueProgress";
import { ArcadeCarController } from "./drivingGame";
import { fitOwnedNativeEquipmentPart, RecoveredEquipmentState } from "./equipmentProgress";
import { applyNativeDrivingEquipment } from "./nativeDrivingEquipment";
import { RecoveredRaceState } from "./raceProgress";
import { peachPartsShopStock } from "./shopCatalog";
import { allWorldFieldNumbers } from "./worldTopology";
import { DrivingWorld, flatFieldCollision } from "./worldCollision";

function flatWorld(): DrivingWorld {
  const world = new DrivingWorld();
  for (const field of allWorldFieldNumbers()) world.addCompiledField(field, flatFieldCollision());
  return world;
}

function firstUpdateSpeed(equipment: RecoveredEquipmentState): number {
  const car = new ArcadeCarController(flatWorld());
  applyNativeDrivingEquipment(car, equipment);
  car.update(1 / 60, { throttle: 1, steering: 0, boost: false });
  return car.state.speed;
}
describe("Peach equipment purchase loop", () => {
  test("purchases, fits, drives and survives recovered-progress reload", () => {
    const panther = peachPartsShopStock.find((item) => item.id === "panther-engine");
    expect(panther).toBeDefined();

    const ownership = new DialogueRuntimeState();
    const commerce = new RecoveredCommerceState();
    const equipment = new RecoveredEquipmentState();
    const races = new RecoveredRaceState();

    const purchase = purchaseIndexedItem(
      ownership,
      commerce,
      panther!.nativeCategory,
      panther!.nativeItemIndex,
      panther!.priceCake,
    );
    expect(purchase).toMatchObject({ status: "purchased", cakeBefore: 1_000, cakeAfter: 500 });
    expect(ownership.indexedFlagCount(2, 1)).toBe(1);

    expect(fitOwnedNativeEquipmentPart(ownership, equipment, 0, 2, 1)).toBe("fitted");
    expect(equipment.selectedItem(0, 2)).toBe(1);

    const baselineSpeed = firstUpdateSpeed(new RecoveredEquipmentState());
    const upgradedSpeed = firstUpdateSpeed(equipment);
    expect(upgradedSpeed / baselineSpeed).toBeCloseTo(1_800 / 1_500, 8);

    const save = createRecoveredDialogueStateSave(
      ownership,
      "2026-09-14T00:00:00.000Z",
      commerce,
      equipment,
      races,
    );
    const restoredOwnership = new DialogueRuntimeState();
    const restoredCommerce = new RecoveredCommerceState();
    const restoredEquipment = new RecoveredEquipmentState();
    restoreRecoveredDialogueStateSave(
      save,
      restoredOwnership,
      restoredCommerce,
      restoredEquipment,
      new RecoveredRaceState(),
    );

    expect(restoredCommerce.cake).toBe(500);
    expect(restoredOwnership.indexedFlagCount(2, 1)).toBe(1);
    expect(restoredEquipment.selectedItem(0, 2)).toBe(1);
    expect(firstUpdateSpeed(restoredEquipment)).toBeCloseTo(upgradedSpeed, 8);
  });
});
