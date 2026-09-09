import type { DialogueRuntimeState } from "../formats/dialogue";
import { RecoveredCommerceState, seedInitialEquipmentOwnership } from "../game/commerceProgress";
import { createRecoveredDialogueStateSave, restoreRecoveredDialogueStateSave } from "../game/dialogueProgress";
import { RecoveredEquipmentState } from "../game/equipmentProgress";
import { RecoveredRaceState } from "../game/raceProgress";
import { readJson, writeJson } from "../storage/opfs";

const recoveredProgressPath = "save/recovered-dialogue-state.json";

export interface RecoveredProgressState {
  readonly dialogueState: DialogueRuntimeState;
  readonly commerceState: RecoveredCommerceState;
  readonly equipmentState: RecoveredEquipmentState;
  readonly raceState: RecoveredRaceState;
}

export interface RecoveredProgressStoreIo {
  read(directory: FileSystemDirectoryHandle, path: string): Promise<unknown>;
  write(directory: FileSystemDirectoryHandle, path: string, value: unknown): Promise<void>;
}

const defaultIo: RecoveredProgressStoreIo = {
  read: (directory, path) => readJson<unknown>(directory, path),
  write: (directory, path, value) => writeJson(directory, path, value),
};
export class RecoveredProgressStore implements RecoveredProgressState {
  readonly dialogueState: DialogueRuntimeState;
  readonly commerceState = new RecoveredCommerceState();
  readonly equipmentState = new RecoveredEquipmentState();
  readonly raceState = new RecoveredRaceState();

  private queuedDialogueRevision = 0;
  private queuedCommerceRevision = 0;
  private queuedEquipmentRevision = 0;
  private queuedRaceRevision = 0;
  private saveQueue: Promise<void> = Promise.resolve();

  private constructor(
    private readonly directory: FileSystemDirectoryHandle,
    private readonly io: RecoveredProgressStoreIo,
    dialogueState: DialogueRuntimeState,
  ) {
    this.dialogueState = dialogueState;
  }

  static async restore(
    directory: FileSystemDirectoryHandle,
    io: RecoveredProgressStoreIo = defaultIo,
  ): Promise<RecoveredProgressStore> {
    const { DialogueRuntimeState } = await import("../formats/dialogue");
    const store = new RecoveredProgressStore(directory, io, new DialogueRuntimeState());
    await store.restoreFromDisk();
    store.markCurrentRevisionsQueued();
    return store;
  }
  queueSave(): void {
    const dialogueRevision = this.dialogueState.revision;
    const commerceRevision = this.commerceState.revision;
    const equipmentRevision = this.equipmentState.revision;
    const raceRevision = this.raceState.revision;
    if (
      dialogueRevision === this.queuedDialogueRevision &&
      commerceRevision === this.queuedCommerceRevision &&
      equipmentRevision === this.queuedEquipmentRevision &&
      raceRevision === this.queuedRaceRevision
    ) return;

    const snapshot = createRecoveredDialogueStateSave(
      this.dialogueState,
      new Date().toISOString(),
      this.commerceState,
      this.equipmentState,
      this.raceState,
    );
    this.queuedDialogueRevision = dialogueRevision;
    this.queuedCommerceRevision = commerceRevision;
    this.queuedEquipmentRevision = equipmentRevision;
    this.queuedRaceRevision = raceRevision;

    this.saveQueue = this.saveQueue
      .catch(() => undefined)
      .then(() => this.io.write(this.directory, recoveredProgressPath, snapshot))
      .then(() => console.info(
        `Recovered persistent state revisions dialogue=${dialogueRevision}, commerce=${commerceRevision}, equipment=${equipmentRevision}, races=${raceRevision} saved.`,
      ))
      .catch((error) => {
        if (this.queuedDialogueRevision === dialogueRevision) this.queuedDialogueRevision = -1;
        if (this.queuedCommerceRevision === commerceRevision) this.queuedCommerceRevision = -1;
        if (this.queuedEquipmentRevision === equipmentRevision) this.queuedEquipmentRevision = -1;
        if (this.queuedRaceRevision === raceRevision) this.queuedRaceRevision = -1;
        console.error("Recovered persistent state could not be saved.", error);
      });
  }

  async flush(): Promise<void> {
    await this.saveQueue;
  }

  private async restoreFromDisk(): Promise<void> {
    try {
      const saved = await this.io.read(this.directory, recoveredProgressPath);
      const schemaVersion = saved && typeof saved === "object"
        ? (saved as { schemaVersion?: unknown }).schemaVersion
        : undefined;
      if (!Number.isInteger(schemaVersion) || (schemaVersion as number) < 4 || (schemaVersion as number) > 10) {
        seedInitialEquipmentOwnership(this.dialogueState);
      }
      restoreRecoveredDialogueStateSave(
        saved,
        this.dialogueState,
        this.commerceState,
        this.equipmentState,
        this.raceState,
      );
      const indexedCount = this.dialogueState.indexedFlagEntries().length;
      const stampCount = this.dialogueState.stampEntries().length;
      console.info(
        `Recovered persistent state restored: ${this.commerceState.cake} Cake, licence class ${this.raceState.licenseClass}, ${indexedCount} indexed progress flag${indexedCount === 1 ? "" : "s"}, ${stampCount} stamp${stampCount === 1 ? "" : "s"}.`,
      );
    } catch (error) {
      seedInitialEquipmentOwnership(this.dialogueState);
      if (!(error instanceof DOMException && error.name === "NotFoundError")) {
        console.warn("The recovered persistent state was invalid or unreadable; an empty state will be used.", error);
      }
    }
  }

  private markCurrentRevisionsQueued(): void {
    this.queuedDialogueRevision = this.dialogueState.revision;
    this.queuedCommerceRevision = this.commerceState.revision;
    this.queuedEquipmentRevision = this.equipmentState.revision;
    this.queuedRaceRevision = this.raceState.revision;
  }
}
