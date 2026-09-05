import { describe, expect, test } from "vitest";
import { DialogueActionOpcode, type DialogueActionToken } from "../formats/dialogue";
import {
  applyRecoveredEquipmentHostAction,
  fitOwnedNativeEquipmentPart,
  nativeEquipmentCategoryCount,
  RecoveredEquipmentState,
} from "./equipmentProgress";

describe("recovered native equipment selectors", () => {
  test("stores one byte per category in each of the three persisted loadouts", () => {
    const state = new RecoveredEquipmentState();
    expect(state.selectorEntries()).toHaveLength(3);
    expect(state.selectorEntries().every((loadout) => loadout.length === nativeEquipmentCategoryCount)).toBe(true);
    expect(state.setSelectedItem(0, 11, 4)).toBe(true);
    expect(state.setSelectedItem(0, 11, 4)).toBe(false);
    expect(state.setSelectedItem(1, 1, 6)).toBe(true);
    expect(state.selectedItem(0, 11)).toBe(4);
    expect(state.selectedItem(1, 1)).toBe(6);
    expect(state.revision).toBe(2);
  });

  test("applies the executable-proven action-15 category/item write", () => {
    const state = new RecoveredEquipmentState();
    const ownerReward = action(DialogueActionOpcode.EquipSelectedPart, [11, 4, 9]);
    expect(applyRecoveredEquipmentHostAction(state, ownerReward)).toBe(true);
    expect(state.selectedItem(0, 11)).toBe(4);
    expect(applyRecoveredEquipmentHostAction(state, ownerReward)).toBe(false);
    expect(applyRecoveredEquipmentHostAction(state, action(DialogueActionOpcode.NumericChoice, [11, 4, 9]))).toBe(false);
  });


  test("runs the Peach Parts Shop -> Q's Factory -> reload Mesh Wheel loop", async () => {
    const { DialogueRuntimeState } = await import("../formats/dialogue");
    const { createRecoveredDialogueStateSave, restoreRecoveredDialogueStateSave } = await import("./dialogueProgress");
    const { purchaseIndexedItem, RecoveredCommerceState, seedInitialEquipmentOwnership } = await import("./commerceProgress");
    const { aggregatePartsAppearance, applyKnownNativeEquipmentSelectors, defaultPartLoadout, nativeFittingCatalogue } = await import("./parts");

    const ownership = new DialogueRuntimeState();
    seedInitialEquipmentOwnership(ownership);
    const commerce = new RecoveredCommerceState(1_000);
    const equipment = new RecoveredEquipmentState();

    const before = nativeFittingCatalogue(ownership, equipment.selectorEntries()[0] ?? []);
    expect(before.find((category) => category.category === "wheels")?.parts.map((part) => part.definition.id)).toEqual(["normal-wheel"]);

    expect(purchaseIndexedItem(ownership, commerce, 7, 1, 500).status).toBe("purchased");
    expect(commerce.cake).toBe(500);
    const afterPurchase = nativeFittingCatalogue(ownership, equipment.selectorEntries()[0] ?? []);
    expect(afterPurchase.find((category) => category.category === "wheels")?.parts.map((part) => part.definition.id)).toEqual(["normal-wheel", "mesh-wheel"]);

    expect(fitOwnedNativeEquipmentPart(ownership, equipment, 0, 7, 1)).toBe("fitted");
    expect(fitOwnedNativeEquipmentPart(ownership, equipment, 0, 7, 1)).toBe("already-fitted");
    expect(fitOwnedNativeEquipmentPart(ownership, equipment, 0, 7, 2)).toBe("not-owned");
    expect(equipment.selectedItem(0, 7)).toBe(1);

    const liveLoadout = applyKnownNativeEquipmentSelectors(defaultPartLoadout, equipment.selectorEntries()[0] ?? []);
    expect(liveLoadout.wheels).toBe("mesh-wheel");
    expect(aggregatePartsAppearance(liveLoadout).wheelStyle).toBe("mesh");

    const saved = createRecoveredDialogueStateSave(ownership, "2026-09-04T18:00:00.000Z", commerce, equipment);
    const restoredOwnership = new DialogueRuntimeState();
    const restoredCommerce = new RecoveredCommerceState();
    const restoredEquipment = new RecoveredEquipmentState();
    restoreRecoveredDialogueStateSave(saved, restoredOwnership, restoredCommerce, restoredEquipment);
    expect(restoredOwnership.indexedFlagCount(7, 1)).toBe(1);
    expect(restoredCommerce.cake).toBe(500);
    expect(restoredEquipment.selectedItem(0, 7)).toBe(1);
    const reloadedLoadout = applyKnownNativeEquipmentSelectors(defaultPartLoadout, restoredEquipment.selectorEntries()[0] ?? []);
    expect(reloadedLoadout.wheels).toBe("mesh-wheel");
    expect(aggregatePartsAppearance(reloadedLoadout).wheelStyle).toBe("mesh");
  });
  test("rejects malformed selector blocks and out-of-range coordinates", () => {
    const state = new RecoveredEquipmentState();
    expect(state.restoreSelectors([[0], [0], [0]])).toBe(false);
    expect(() => state.setSelectedItem(3, 1, 0)).toThrow(RangeError);
    expect(() => state.setSelectedItem(0, 15, 0)).toThrow(RangeError);
    expect(() => state.setSelectedItem(0, 1, 256)).toThrow(RangeError);
  });
});

function action(opcode: DialogueActionOpcode, operands: number[]): DialogueActionToken {
  return { kind: "action", offset: 0, opcode, operands: new Uint8Array(operands) };
}
