import { describe, expect, test } from "vitest";
import type { RecoveredDialogueStateSave } from "../game/dialogueProgress";
import { RecoveredProgressStore, type RecoveredProgressStoreIo } from "./recoveredProgressStore";

const directory = {} as FileSystemDirectoryHandle;

function missingIo(writes: unknown[] = []): RecoveredProgressStoreIo {
  return {
    read: async () => { throw new DOMException("missing", "NotFoundError"); },
    write: async (_directory, _path, value) => { writes.push(value); },
  };
}

describe("RecoveredProgressStore", () => {
  test("seeds a new save once and does not immediately rewrite it", async () => {
    const writes: unknown[] = [];
    const store = await RecoveredProgressStore.restore(directory, missingIo(writes));

    expect(store.commerceState.cake).toBe(1_000);
    for (let namespace = 1; namespace <= 7; namespace += 1) {
      expect(store.dialogueState.indexedFlagCount(namespace, 0)).toBe(2);
    }
    store.queueSave();
    await store.flush();
    expect(writes).toEqual([]);

    store.commerceState.applyCakeMutation(100);
    store.queueSave();
    await store.flush();
    expect(writes).toHaveLength(1);
    expect((writes[0] as RecoveredDialogueStateSave).cake).toBe(900);
  });

  test("restores the complete schema-10 player progress bundle", async () => {
    const saved: RecoveredDialogueStateSave = {
      schemaVersion: 10,
      savedAt: "2026-09-05T00:00:00.000Z",
      indexedFlags: [[15, 9]],
      indexedOwnership: [[1, 2, 3], [15, 9, 1]],
      stamps: [12],
      cake: 4_321,
      equipmentSelectors: Array.from({ length: 3 }, () => Array<number>(15).fill(0)),
      paintWord: 0x12345678,
      quickPicPhotos: [1, 100],
      metFixedInteractions: [[1, 0]],
      advertisingDistanceUnits: [1, 2, 3, 4, 5],
      raceLicenseClass: 2,
      ordinaryRaceFinishIndices: [0, ...Array<number>(23).fill(0xff)],
    };
    const writes: unknown[] = [];
    const io: RecoveredProgressStoreIo = {
      read: async () => saved,
      write: async (_directory, _path, value) => { writes.push(value); },
    };
    const store = await RecoveredProgressStore.restore(directory, io);

    expect(store.commerceState.cake).toBe(4_321);
    expect(store.dialogueState.indexedFlagCount(1, 2)).toBe(3);
    expect(store.dialogueState.hasStamp(12)).toBe(true);
    expect(store.dialogueState.quickPicPhotoEntries()).toEqual([1, 100]);
    expect(store.equipmentState.paintWord).toBe(0x12345678);
    expect(store.raceState.licenseClass).toBe(2);
    expect(store.raceState.finishIndex(0)).toBe(0);
    store.queueSave();
    await store.flush();
    expect(writes).toEqual([]);
  });

  test("serializes queued snapshots in revision order", async () => {
    const writes: RecoveredDialogueStateSave[] = [];
    let releaseFirst: (() => void) | undefined;
    const firstWrite = new Promise<void>((resolve) => { releaseFirst = resolve; });
    const io: RecoveredProgressStoreIo = {
      read: async () => { throw new DOMException("missing", "NotFoundError"); },
      write: async (_directory, _path, value) => {
        writes.push(value as RecoveredDialogueStateSave);
        if (writes.length === 1) await firstWrite;
      },
    };
    const store = await RecoveredProgressStore.restore(directory, io);

    store.commerceState.applyCakeMutation(100);
    store.queueSave();
    store.commerceState.applyCakeMutation(100);
    store.queueSave();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(writes.map((save) => save.cake)).toEqual([900]);

    releaseFirst?.();
    await store.flush();
    expect(writes.map((save) => save.cake)).toEqual([900, 800]);
  });
});
