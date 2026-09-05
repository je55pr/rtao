import { describe, expect, test } from "vitest";
import {
  DialogueActionOpcode,
  DialogueOpcode,
  DialogueFlow,
  DialogueRuntimeState,
  type DialogueActionToken,
  type DialogueEntity,
  type DialogueVariant,
} from "../formats/dialogue";
import {
  applyRecoveredDialogueHostAction,
  createRecoveredDialogueStateSave,
  restoreRecoveredDialogueStateSave,
} from "./dialogueProgress";
import { purchaseIndexedItem, RecoveredCommerceState } from "./commerceProgress";
import { applyRecoveredEquipmentHostAction, RecoveredEquipmentState } from "./equipmentProgress";
import { RecoveredRaceState } from "./raceProgress";

describe("recovered dialogue progress", () => {
  test("round-trips sorted indexed flags and rejects malformed entries", () => {
    const restored = restoreRecoveredDialogueStateSave({
      schemaVersion: 1,
      indexedFlags: [[15, 39], [0, 150], [-1, 2], [15, 256], [15], "bad"],
    }, new DialogueRuntimeState());
    expect(restored.indexedFlagEntries()).toEqual([[0, 150], [15, 39]]);
    expect(createRecoveredDialogueStateSave(restored, "2026-09-01T00:00:00.000Z")).toEqual({
      schemaVersion: 10,
      savedAt: "2026-09-01T00:00:00.000Z",
      indexedFlags: [[0, 150], [15, 39]],
      indexedOwnership: [[0, 150, 1], [15, 39, 1]],
      stamps: [],
      cake: 1_000,
      equipmentSelectors: Array.from({ length: 3 }, () => Array(15).fill(0)),
      paintWord: null,
      quickPicPhotos: [],
      metFixedInteractions: [],
      advertisingDistanceUnits: [0, 0, 0, 0, 0],
      raceLicenseClass: 0,
      ordinaryRaceFinishIndices: Array(24).fill(0xff),
    });
  });

  test("applies action 07 exactly once to the executable-selected bank and bit", () => {
    const state = new DialogueRuntimeState();
    const grant = action(DialogueActionOpcode.GrantIndexedFlag, [15, 39]);
    expect(applyRecoveredDialogueHostAction(state, grant)).toBe(true);
    expect(applyRecoveredDialogueHostAction(state, grant)).toBe(false);
    expect(state.indexedFlagEntries()).toEqual([[15, 39]]);
    expect(state.revision).toBe(1);
  });

  test("does not treat unrelated or truncated actions as inventory producers", () => {
    const state = new DialogueRuntimeState();
    expect(applyRecoveredDialogueHostAction(state, action(DialogueActionOpcode.NumericChoice, [0, 0, 0]))).toBe(false);
    expect(applyRecoveredDialogueHostAction(state, action(DialogueActionOpcode.GrantIndexedFlag, [15]))).toBe(false);
    expect(state.indexedFlagEntries()).toEqual([]);
  });

  test("deduplicates single and paired stamp awards and persists them", () => {
    const state = new DialogueRuntimeState();
    expect(applyRecoveredDialogueHostAction(state, action(DialogueActionOpcode.GrantStamps, [21, 22]))).toBe(true);
    expect(applyRecoveredDialogueHostAction(state, action(DialogueActionOpcode.GrantStamps, [22]))).toBe(false);
    expect(state.stampEntries()).toEqual([21, 22]);
    const restored = restoreRecoveredDialogueStateSave(createRecoveredDialogueStateSave(state), new DialogueRuntimeState());
    expect(restored.stampEntries()).toEqual([21, 22]);
  });

  test("migrates v1 indexed saves without inventing stamps", () => {
    const restored = restoreRecoveredDialogueStateSave({ schemaVersion: 1, indexedFlags: [[15, 39]] }, new DialogueRuntimeState());
    expect(restored.indexedFlagEntries()).toEqual([[15, 39]]);
    expect(restored.stampEntries()).toEqual([]);
  });

  test("persists Cake and namespace-zero Body Shop ownership across reload", () => {
    const state = new DialogueRuntimeState();
    const commerce = new RecoveredCommerceState(1_000);
    expect(purchaseIndexedItem(state, commerce, 0, 13, 500).status).toBe("purchased");
    const saved = createRecoveredDialogueStateSave(state, "2026-09-01T00:00:00.000Z", commerce);
    expect(saved).toMatchObject({ schemaVersion: 10, cake: 500, indexedFlags: [[0, 13]], indexedOwnership: [[0, 13, 1]] });

    const restoredState = new DialogueRuntimeState();
    const restoredCommerce = new RecoveredCommerceState();
    restoreRecoveredDialogueStateSave(saved, restoredState, restoredCommerce);
    expect(restoredState.hasIndexedFlag(0, 13)).toBe(true);
    expect(restoredCommerce.cake).toBe(500);
    expect(purchaseIndexedItem(restoredState, restoredCommerce, 0, 13, 500).status).toBe("already-owned");
    expect(restoredCommerce.cake).toBe(500);
  });

  test("round-trips all five advertising counters and migrates schema 8 as zero distance", () => {
    const commerce = new RecoveredCommerceState();
    commerce.addAdvertisingDistanceUnits(0, 999);
    commerce.addAdvertisingDistanceUnits(4, 2_345);
    const saved = createRecoveredDialogueStateSave(
      new DialogueRuntimeState(), "2026-09-05T00:00:00.000Z", commerce,
    );
    expect(saved).toMatchObject({
      schemaVersion: 10,
      advertisingDistanceUnits: [999, 0, 0, 0, 2_345],
    });

    const restored = new RecoveredCommerceState();
    restoreRecoveredDialogueStateSave(saved, new DialogueRuntimeState(), restored);
    expect(restored.advertisingDistanceEntries()).toEqual([999, 0, 0, 0, 2_345]);
    expect(restored.revision).toBe(0);

    const migrated = new RecoveredCommerceState();
    restoreRecoveredDialogueStateSave({
      ...saved,
      schemaVersion: 8,
      advertisingDistanceUnits: [1, 2, 3, 4, 5],
    }, new DialogueRuntimeState(), migrated);
    expect(migrated.advertisingDistanceEntries()).toEqual([0, 0, 0, 0, 0]);
  });

  test("round-trips native licence and ordinary-race finish bytes and migrates schema 9", () => {
    const races = new RecoveredRaceState();
    const finishIndices = Array<number>(24).fill(0xff);
    finishIndices[0] = 2;
    finishIndices[7] = 5;
    expect(races.restore(1, finishIndices)).toBe(true);
    const saved = createRecoveredDialogueStateSave(
      new DialogueRuntimeState(), "2026-09-05T00:00:00.000Z",
      new RecoveredCommerceState(), new RecoveredEquipmentState(), races,
    );
    expect(saved).toMatchObject({
      schemaVersion: 10,
      raceLicenseClass: 1,
      ordinaryRaceFinishIndices: expect.arrayContaining([2, 5]),
    });

    const restored = new RecoveredRaceState();
    restoreRecoveredDialogueStateSave(
      saved, new DialogueRuntimeState(), new RecoveredCommerceState(), new RecoveredEquipmentState(), restored,
    );
    expect(restored.licenseClass).toBe(1);
    expect(restored.finishIndex(0)).toBe(2);
    expect(restored.finishIndex(7)).toBe(5);
    expect(restored.revision).toBe(0);

    const migrated = new RecoveredRaceState();
    restoreRecoveredDialogueStateSave(
      { ...saved, schemaVersion: 9, raceLicenseClass: 3, ordinaryRaceFinishIndices: Array(24).fill(0) },
      new DialogueRuntimeState(), new RecoveredCommerceState(), new RecoveredEquipmentState(), migrated,
    );
    expect(migrated.licenseClass).toBe(0);
    expect(migrated.finishEntries()).toEqual(Array(24).fill(0xff));
  });

  test("persists Parts Shop ownership in the executable category namespace", () => {
    const state = new DialogueRuntimeState();
    const commerce = new RecoveredCommerceState(1_000);
    for (let copy = 0; copy < 3; copy += 1) expect(purchaseIndexedItem(state, commerce, 14, 1, 100).status).toBe("purchased");
    const saved = createRecoveredDialogueStateSave(state, "2026-09-01T00:00:00.000Z", commerce);
    expect(saved.indexedOwnership).toEqual([[14, 1, 3]]);

    const restoredState = new DialogueRuntimeState();
    const restoredCommerce = new RecoveredCommerceState();
    restoreRecoveredDialogueStateSave(saved, restoredState, restoredCommerce);
    expect(restoredState.hasIndexedFlag(14, 1)).toBe(true);
    expect(restoredState.indexedFlagCount(14, 1)).toBe(3);
    expect(restoredCommerce.cake).toBe(700);
    expect(purchaseIndexedItem(restoredState, restoredCommerce, 14, 1, 100).status).toBe("purchased");
    expect(restoredState.indexedFlagCount(14, 1)).toBe(4);
    expect(restoredCommerce.cake).toBe(600);
  });

  test("migrates schema-v3 equipment flags as one owned copy", () => {
    const state = new DialogueRuntimeState();
    const commerce = new RecoveredCommerceState();
    restoreRecoveredDialogueStateSave({ schemaVersion: 3, indexedFlags: [[1, 6]], stamps: [], cake: 500 }, state, commerce);
    expect(state.indexedFlagCount(1, 6)).toBe(1);
    expect(commerce.cake).toBe(500);
  });

  test("persists all three native equipment selector blocks and migrates schema 4", () => {
    const state = new DialogueRuntimeState();
    const commerce = new RecoveredCommerceState();
    const equipment = new RecoveredEquipmentState();
    equipment.setSelectedItem(0, 11, 4);
    equipment.setSelectedItem(1, 1, 6);
    equipment.setSelectedItem(2, 14, 1);
    const saved = createRecoveredDialogueStateSave(state, "2026-09-01T00:00:00.000Z", commerce, equipment);

    const restored = new RecoveredEquipmentState();
    restoreRecoveredDialogueStateSave(saved, new DialogueRuntimeState(), new RecoveredCommerceState(), restored);
    expect(restored.selectedItem(0, 11)).toBe(4);
    expect(restored.selectedItem(1, 1)).toBe(6);
    expect(restored.selectedItem(2, 14)).toBe(1);
    expect(restored.revision).toBe(0);

    const migrated = new RecoveredEquipmentState();
    restoreRecoveredDialogueStateSave({ schemaVersion: 4, indexedFlags: [], indexedOwnership: [], stamps: [], cake: 1_000 }, new DialogueRuntimeState(), new RecoveredCommerceState(), migrated);
    expect(migrated.selectorEntries()).toEqual(Array.from({ length: 3 }, () => Array(15).fill(0)));
  });

  test("persists the native packed paint word and leaves schema 5 colour-compatible", () => {
    const equipment = new RecoveredEquipmentState();
    equipment.setPaintWord(0x12abcdef);
    const saved = createRecoveredDialogueStateSave(new DialogueRuntimeState(), "2026-09-01T00:00:00.000Z", new RecoveredCommerceState(), equipment);
    expect(saved).toMatchObject({ schemaVersion: 10, paintWord: 0x12abcdef });

    const restored = new RecoveredEquipmentState();
    restoreRecoveredDialogueStateSave(saved, new DialogueRuntimeState(), new RecoveredCommerceState(), restored);
    expect(restored.paintWord).toBe(0x12abcdef);
    expect(restored.revision).toBe(0);

    const migrated = new RecoveredEquipmentState();
    restoreRecoveredDialogueStateSave({
      schemaVersion: 5,
      indexedFlags: [], indexedOwnership: [], stamps: [], cake: 1_000,
      equipmentSelectors: Array.from({ length: 3 }, () => Array(15).fill(0)),
    }, new DialogueRuntimeState(), new RecoveredCommerceState(), migrated);
    expect(migrated.paintWord).toBeUndefined();
  });

  test("persists the paired original reward ownership and equipment write", () => {
    const state = new DialogueRuntimeState();
    const equipment = new RecoveredEquipmentState();
    expect(applyRecoveredDialogueHostAction(state, action(DialogueActionOpcode.GrantIndexedFlag, [11, 4]))).toBe(true);
    expect(applyRecoveredEquipmentHostAction(equipment, action(DialogueActionOpcode.EquipSelectedPart, [11, 4, 9]))).toBe(true);

    const saved = createRecoveredDialogueStateSave(state, "2026-09-01T00:00:00.000Z", new RecoveredCommerceState(), equipment);
    const restoredState = new DialogueRuntimeState();
    const restoredEquipment = new RecoveredEquipmentState();
    restoreRecoveredDialogueStateSave(saved, restoredState, new RecoveredCommerceState(), restoredEquipment);
    expect(restoredState.indexedFlagCount(11, 4)).toBe(1);
    expect(restoredEquipment.selectedItem(0, 11)).toBe(4);
  });

  test("accepts Quick-Pic photo IDs through 100, rejects out-of-range IDs, and deduplicates", () => {
    const state = new DialogueRuntimeState();
    for (const photoNumber of [96, 97, 100]) {
      expect(applyRecoveredDialogueHostAction(state, action(DialogueActionOpcode.RecordQuickPicPhoto, [photoNumber, 6]))).toBe(true);
    }
    expect(applyRecoveredDialogueHostAction(state, action(DialogueActionOpcode.RecordQuickPicPhoto, [0, 6]))).toBe(false);
    expect(applyRecoveredDialogueHostAction(state, action(DialogueActionOpcode.RecordQuickPicPhoto, [101, 6]))).toBe(false);
    expect(applyRecoveredDialogueHostAction(state, action(DialogueActionOpcode.RecordQuickPicPhoto, [100, 6]))).toBe(false);
    expect(state.quickPicPhotoEntries()).toEqual([96, 97, 100]);
    expect(state.hasStamp(96)).toBe(false);
  });

  test("awards Stamp 96 only when recording completes all 100 Quick-Pics", () => {
    const state = new DialogueRuntimeState();
    for (let photoNumber = 1; photoNumber <= 99; photoNumber += 1) {
      expect(applyRecoveredDialogueHostAction(state, action(DialogueActionOpcode.RecordQuickPicPhoto, [photoNumber, 6]))).toBe(true);
    }
    expect(state.quickPicPhotoEntries()).toHaveLength(99);
    expect(state.isQuickPicComplete()).toBe(false);
    expect(state.hasStamp(96)).toBe(false);

    expect(applyRecoveredDialogueHostAction(state, action(DialogueActionOpcode.RecordQuickPicPhoto, [100, 6]))).toBe(true);
    expect(state.quickPicPhotoEntries()).toHaveLength(100);
    expect(state.isQuickPicComplete()).toBe(true);
    expect(state.stampEntries()).toContain(96);
  });

  test("keeps a complete 100-photo Quick-Pic save stable across reload and reinteraction", () => {
    const state = new DialogueRuntimeState();
    for (let photoNumber = 1; photoNumber <= 100; photoNumber += 1) {
      applyRecoveredDialogueHostAction(state, action(DialogueActionOpcode.RecordQuickPicPhoto, [photoNumber, 6]));
    }
    const saved = createRecoveredDialogueStateSave(state, "2026-09-04T00:00:00.000Z");
    expect(saved).toMatchObject({ schemaVersion: 10, stamps: expect.arrayContaining([96]) });
    expect(saved.quickPicPhotos).toHaveLength(100);

    const restored = restoreRecoveredDialogueStateSave(saved, new DialogueRuntimeState());
    expect(restored.quickPicPhotoEntries()).toHaveLength(100);
    expect(restored.hasQuickPicPhoto(97)).toBe(true);
    expect(restored.hasQuickPicPhoto(100)).toBe(true);
    expect(restored.hasStamp(96)).toBe(true);
    const revision = restored.revision;
    expect(applyRecoveredDialogueHostAction(restored, action(DialogueActionOpcode.RecordQuickPicPhoto, [100, 6]))).toBe(false);
    expect(restored.revision).toBe(revision);
    expect(restored.quickPicPhotoEntries()).toHaveLength(100);
    expect(restored.stampEntries().filter((stampId) => stampId === 96)).toHaveLength(1);
  });

  test("migrates schema 6 without fabricating Quick-Pic completion", () => {
    const restored = restoreRecoveredDialogueStateSave({
      schemaVersion: 6,
      indexedFlags: [], indexedOwnership: [], stamps: [], cake: 1_000,
      equipmentSelectors: Array.from({ length: 3 }, () => Array(15).fill(0)), paintWord: 0,
    }, new DialogueRuntimeState());
    expect(restored.quickPicPhotoEntries()).toEqual([]);
  });

  test("persists native fixed-interaction first-meeting completion", () => {
    const state = new DialogueRuntimeState();
    expect(state.markFixedInteractionMet(6, 9)).toBe(true);
    expect(state.markFixedInteractionMet(6, 16)).toBe(true);
    const saved = createRecoveredDialogueStateSave(state, "2026-09-01T00:00:00.000Z");
    expect(saved).toMatchObject({ schemaVersion: 10, metFixedInteractions: [[6, 9], [6, 16]] });

    const restored = restoreRecoveredDialogueStateSave(saved, new DialogueRuntimeState());
    expect(restored.metFixedInteractionEntries()).toEqual([[6, 9], [6, 16]]);
  });

  test("migrates schema-v2 stamp saves without replacing the proven starting Cake", () => {
    const state = new DialogueRuntimeState();
    const commerce = new RecoveredCommerceState();
    restoreRecoveredDialogueStateSave({ schemaVersion: 2, indexedFlags: [[15, 39]], stamps: [31] }, state, commerce);
    expect(state.hasIndexedFlag(15, 39)).toBe(true);
    expect(state.stampEntries()).toEqual([31]);
    expect(commerce.cake).toBe(1_000);
  });

  test("carries a granted football through a save and consumes it in the PAL-style branch", () => {
    const producer = new DialogueRuntimeState();
    applyRecoveredDialogueHostAction(producer, action(DialogueActionOpcode.GrantIndexedFlag, [15, 39]));
    const restored = restoreRecoveredDialogueStateSave(createRecoveredDialogueStateSave(producer), new DialogueRuntimeState());
    const consumer: DialogueEntity = {
      areaIndex: 3,
      entityIndex: 14,
      entityAddress: 0,
      name: "Mr. King",
      variants: [
        variant(3, [{ kind: "control", offset: 0, opcode: DialogueOpcode.BranchIfIndexedFlagSet, operands: new Uint8Array([15, 39, 4]), phase: "pre-text" }], ["Still waiting"]),
        variant(4, [{ kind: "control", offset: 0, opcode: DialogueOpcode.ClearIndexedFlag, operands: new Uint8Array([15, 39]), phase: "pre-text" }], ["The football!"]),
      ],
    };
    const flow = new DialogueFlow(consumer, restored, 3);
    expect(flow.currentSlot).toBe(4);
    expect(restored.hasIndexedFlag(15, 39)).toBe(false);
    expect(restored.revision).toBe(3);
  });
});

function action(opcode: DialogueActionOpcode, operands: number[]): DialogueActionToken {
  return { kind: "action", offset: 0, opcode, operands: new Uint8Array(operands) };
}

function variant(slot: number, tokens: DialogueVariant["tokens"], pages: string[]): DialogueVariant {
  return { pointerTableSlot: slot, textAddress: 0, bytes: new Uint8Array(), tokens, pages };
}
