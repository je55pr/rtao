import type { DialogueActionToken, DialogueRuntimeState } from "../formats/dialogue";
import { isQuickPicPhotoNumber, QUICK_PIC_COMPLETION_STAMP_ID } from "../formats/quickPic";
import { RecoveredCommerceState } from "./commerceProgress";
import { RecoveredEquipmentState } from "./equipmentProgress";
import { RecoveredRaceState } from "./raceProgress";

const grantIndexedFlagAction = 0x07;
const grantStampsAction = 0x0d;
const recordQuickPicPhotoAction = 0x11;

export interface RecoveredDialogueStateSave {
  readonly schemaVersion: typeof recoveredSaveSchemaVersion;
  readonly savedAt: string;
  readonly indexedFlags: readonly (readonly [number, number])[];
  readonly indexedOwnership: readonly (readonly [number, number, number])[];
  readonly stamps: readonly number[];
  readonly cake: number;
  readonly equipmentSelectors: readonly (readonly number[])[];
  readonly paintWord: number | null;
  readonly quickPicPhotos: readonly number[];
  readonly metFixedInteractions: readonly (readonly [number, number])[];
  readonly advertisingDistanceUnits: readonly number[];
  readonly raceLicenseClass: number;
  readonly ordinaryRaceFinishIndices: readonly number[];
}

/** The only recovered-progress schema this build reads or writes. */
export const recoveredSaveSchemaVersion = 10;

/**
 * A save the current build can restore. Callers seed a fresh recovered state
 * when this is false, so seeding and restoring stay mutually exclusive.
 */
export function isRestorableRecoveredSave(value: unknown): value is RecoveredDialogueStateSave {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<RecoveredDialogueStateSave>;
  return record.schemaVersion === recoveredSaveSchemaVersion && Array.isArray(record.indexedOwnership);
}

/**
 * Serialises only recovered executable-backed progress: indexed ownership and
 * flags, stamps, Cake, native car configuration, Quick-Pic completion bits,
 * fixed-interaction first meetings, advertising counters, and the native licence
 * class with its 24 ordinary-race best-finish bytes.
 *
 * Only the current schema is readable. Earlier schemas are deliberately not
 * migrated: an unreadable save starts a fresh recovered state instead.
 */
export function createRecoveredDialogueStateSave(
  state: DialogueRuntimeState,
  savedAt = new Date().toISOString(),
  commerce = new RecoveredCommerceState(),
  equipment = new RecoveredEquipmentState(),
  races = new RecoveredRaceState(),
): RecoveredDialogueStateSave {
  return {
    schemaVersion: recoveredSaveSchemaVersion,
    savedAt,
    indexedFlags: state.indexedFlagEntries(),
    indexedOwnership: state.indexedOwnershipEntries(),
    stamps: state.stampEntries(),
    cake: commerce.cake,
    equipmentSelectors: equipment.selectorEntries(),
    paintWord: equipment.paintWord ?? null,
    quickPicPhotos: state.quickPicPhotoEntries(),
    metFixedInteractions: state.metFixedInteractionEntries(),
    advertisingDistanceUnits: commerce.advertisingDistanceEntries(),
    raceLicenseClass: races.licenseClass,
    ordinaryRaceFinishIndices: races.finishEntries(),
  };
}

export function restoreRecoveredDialogueStateSave(
  value: unknown,
  state: DialogueRuntimeState,
  commerce = new RecoveredCommerceState(),
  equipment = new RecoveredEquipmentState(),
  races = new RecoveredRaceState(),
): DialogueRuntimeState {
  if (!isRestorableRecoveredSave(value)) return state;
  const record = value;
  for (const candidate of record.indexedOwnership) {
    if (!Array.isArray(candidate) || candidate.length !== 3) continue;
    const [namespace, index, count] = candidate;
    if (!isByte(namespace) || !isByte(index) || !Number.isInteger(count) || count < 1 || count > 5) continue;
    const copies = namespace >= 1 && namespace <= 14 ? count : 1;
    for (let copy = 0; copy < copies; copy += 1) state.setIndexedFlag(namespace, index);
  }
  if (Array.isArray(record.stamps)) {
    for (const stampId of record.stamps) if (isByte(stampId) && stampId > 0) state.addStamp(stampId);
  }
  if (typeof record.cake === "number") commerce.restoreCake(record.cake);
  equipment.restoreSelectors(record.equipmentSelectors);
  if (typeof record.paintWord === "number") equipment.restorePaintWord(record.paintWord);
  if (Array.isArray(record.quickPicPhotos)) {
    for (const photoNumber of record.quickPicPhotos) if (isQuickPicPhotoNumber(photoNumber)) state.addQuickPicPhoto(photoNumber);
  }
  if (Array.isArray(record.metFixedInteractions)) {
    for (const candidate of record.metFixedInteractions) {
      if (!Array.isArray(candidate) || candidate.length !== 2) continue;
      const [areaIndex, localIndex] = candidate;
      if (!Number.isInteger(areaIndex) || areaIndex < 0 || areaIndex >= 32) continue;
      if (!Number.isInteger(localIndex) || localIndex < 0 || localIndex >= 32) continue;
      state.markFixedInteractionMet(areaIndex, localIndex);
    }
  }
  commerce.restoreAdvertisingDistanceUnits(record.advertisingDistanceUnits);
  races.restore(record.raceLicenseClass, record.ordinaryRaceFinishIndices);
  return state;
}

/** Applies the original action-07 callback's state mutation. */
export function applyRecoveredDialogueHostAction(
  state: DialogueRuntimeState,
  action: DialogueActionToken,
): boolean {
  if (action.opcode === grantIndexedFlagAction && action.operands.length >= 2) {
    return state.setIndexedFlag(action.operands[0] ?? 0, action.operands[1] ?? 0);
  }
  if (action.opcode === grantStampsAction) {
    let changed = false;
    for (const stampId of action.operands) changed = state.addStamp(stampId) || changed;
    return changed;
  }
  if (action.opcode === recordQuickPicPhotoAction && action.operands.length >= 2) {
    const photoNumber = action.operands[0] ?? 0;
    const photoChanged = state.addQuickPicPhoto(photoNumber);
    if (!photoChanged && !state.hasQuickPicPhoto(photoNumber)) return false;
    const stampChanged = state.isQuickPicComplete() ? state.addStamp(QUICK_PIC_COMPLETION_STAMP_ID) : false;
    return photoChanged || stampChanged;
  }
  return false;
}

function isByte(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 0 && (value as number) <= 0xff;
}
