import type { DialogueActionToken } from "../formats/dialogue";
import { knownNativePart } from "./parts";

export const nativeEquipmentCategoryCount = 15;
export const nativeEquipmentLoadoutCount = 3;

export type NativeEquipmentSelectors = readonly (readonly number[])[];

const equipSelectedPartAction = 0x15;

/**
 * Persisted selector bytes at native save offsets +0x0c, +0x28 and +0x44.
 * Category zero is the body selector; categories 1..14 are the Parts Shop
 * ownership namespaces in the executable-defined order.
 */
export class RecoveredEquipmentState {
  private selectors = emptySelectors();
  private storedPaintWord: number | undefined;
  private progressRevision = 0;

  get revision(): number {
    return this.progressRevision;
  }

  get paintWord(): number | undefined {
    return this.storedPaintWord;
  }

  setPaintWord(value: number): boolean {
    assertWord(value, "Paint configuration");
    const word = value >>> 0;
    if (this.storedPaintWord === word) return false;
    this.storedPaintWord = word;
    this.progressRevision += 1;
    return true;
  }

  selectedItem(loadoutIndex: number, category: number): number {
    assertLoadout(loadoutIndex);
    assertCategory(category);
    return this.selectors[loadoutIndex]![category]!;
  }

  setSelectedItem(loadoutIndex: number, category: number, item: number): boolean {
    assertLoadout(loadoutIndex);
    assertCategory(category);
    assertByte(item, "Equipment item");
    if (this.selectors[loadoutIndex]![category] === item) return false;
    this.selectors[loadoutIndex]![category] = item;
    this.progressRevision += 1;
    return true;
  }

  selectorEntries(): NativeEquipmentSelectors {
    return Object.freeze(this.selectors.map((loadout) => Object.freeze([...loadout])));
  }

  /** Restores all three complete selector blocks without manufacturing a mutation. */
  restoreSelectors(value: unknown): boolean {
    const parsed = parseSelectors(value);
    if (!parsed) return false;
    this.selectors = parsed;
    return true;
  }

  /** Restores the native packed primary/secondary/wheel colour word. */
  restorePaintWord(value: unknown): boolean {
    if (!isWord(value)) return false;
    this.storedPaintWord = value >>> 0;
    return true;
  }
}

/**
 * Native post-text action 0x15 calls helper 0x0023df78 with
 * (saveBlock, category, item), then follows operand two as its dialogue slot.
 */
export function applyRecoveredEquipmentHostAction(
  equipment: RecoveredEquipmentState,
  action: DialogueActionToken,
  loadoutIndex = 0,
): boolean {
  if (action.opcode !== equipSelectedPartAction || action.operands.length < 3) return false;
  return equipment.setSelectedItem(loadoutIndex, action.operands[0]!, action.operands[1]!);
}

export interface NativeEquipmentOwnershipState {
  indexedFlagCount(namespace: number, index: number): number;
}

export type NativeEquipmentFitStatus = "fitted" | "already-fitted" | "not-owned" | "unmapped";

/**
 * Q's Factory fitting gate: a mapped native part may be selected only when the
 * save owns at least one copy. Re-selecting the current item is a stable no-op.
 */
export function fitOwnedNativeEquipmentPart(
  ownership: NativeEquipmentOwnershipState,
  equipment: RecoveredEquipmentState,
  loadoutIndex: number,
  category: number,
  item: number,
): NativeEquipmentFitStatus {
  if (!knownNativePart(category, item)) return "unmapped";
  if (equipment.selectedItem(loadoutIndex, category) === item) return "already-fitted";
  // Native selector zero is the baseline/no-equipped choice rather than a
  // purchased inventory grant; every nonzero fitting remains ownership-gated.
  if (item !== 0 && ownership.indexedFlagCount(category, item) <= 0) return "not-owned";
  equipment.setSelectedItem(loadoutIndex, category, item);
  return "fitted";
}

function emptySelectors(): number[][] {
  return Array.from({ length: nativeEquipmentLoadoutCount }, () => Array<number>(nativeEquipmentCategoryCount).fill(0));
}

function parseSelectors(value: unknown): number[][] | undefined {
  if (!Array.isArray(value) || value.length !== nativeEquipmentLoadoutCount) return undefined;
  const selectors: number[][] = [];
  for (const candidate of value) {
    if (!Array.isArray(candidate) || candidate.length !== nativeEquipmentCategoryCount || !candidate.every(isByte)) return undefined;
    selectors.push([...candidate]);
  }
  return selectors;
}

function assertLoadout(value: number): void {
  if (!Number.isInteger(value) || value < 0 || value >= nativeEquipmentLoadoutCount) {
    throw new RangeError(`Equipment loadout ${value} lies outside the three native configuration blocks.`);
  }
}

function assertCategory(value: number): void {
  if (!Number.isInteger(value) || value < 0 || value >= nativeEquipmentCategoryCount) {
    throw new RangeError(`Equipment category ${value} lies outside the native 0..14 selector range.`);
  }
}

function assertByte(value: number, label: string): void {
  if (!isByte(value)) throw new RangeError(`${label} must be a byte.`);
}

function assertWord(value: number, label: string): void {
  if (!isWord(value)) throw new RangeError(`${label} must be an unsigned 32-bit word.`);
}

function isByte(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 0 && (value as number) <= 0xff;
}


function isWord(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 0 && (value as number) <= 0xffff_ffff;
}
