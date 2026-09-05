import { Elf32AddressSpace } from "./elf32";
import { isQuickPicPhotoNumber, QUICK_PIC_PHOTO_COUNT } from "./quickPic";

export enum DialogueOpcode {
  BranchIfFlagSet = 0x01, BranchIfFlagClear = 0x02, BranchIfIndexedFlagSet = 0x03, BranchIfFirstInteraction = 0x04,
  BranchIfQuickPicTaken = 0x05, BranchIfStampSet = 0x06, BranchIfTeamIncomplete = 0x07, Unknown08 = 0x08, MenuMarker = 0x09,
  NewLine = 0x0a, BranchIfResultCodeEquals = 0x0b, PageBreak = 0x0c, Unknown0d = 0x0d,
  BranchByRallyStage = 0x0e, SetFlag = 0x0f, ClearFlag = 0x10, ClearIndexedFlag = 0x11, Action10 = 0x12,
  SetRallyStage = 0x13, Transition = 0x14, Unknown15 = 0x15, Unknown16 = 0x16, RegisterMyCityResident = 0x17,
  Unknown18 = 0x18, Unknown19 = 0x19, Unknown1a = 0x1a, WorldGrandPrixUnlockGate = 0x1b,
  BranchIfCurrentAreaEquals = 0x1c, Unknown1d = 0x1d,
}

export enum DialogueActionOpcode {
  Unknown00 = 0x00, YesNoDefaultFirst = 0x01, YesNoDefaultSecond = 0x02, StartRace = 0x03,
  SelectTeamCar = 0x04, NumericChoice = 0x05, Unknown06 = 0x06, GrantIndexedFlag = 0x07, RaceSelect = 0x08,
  Menu = 0x09, Unknown0a = 0x0a, Unknown0b = 0x0b, Unknown0c = 0x0c, GrantStamps = 0x0d,
  SaveData = 0x0e, Unknown0f = 0x0f, Unknown10 = 0x10, RecordQuickPicPhoto = 0x11, Unknown12 = 0x12,
  Unknown13 = 0x13, Transition = 0x14, EquipSelectedPart = 0x15, RedeemAdvertisingCake = 0x16, Unknown17 = 0x17, Unknown18 = 0x18,
}

export interface DialogueTextToken { readonly kind: "text"; readonly offset: number; readonly text: string }
export interface DialogueControlToken { readonly kind: "control"; readonly offset: number; readonly opcode: DialogueOpcode; readonly operands: Uint8Array; readonly phase: "pre-text" | "inline-text" }
export interface DialogueActionToken { readonly kind: "action"; readonly offset: number; readonly opcode: DialogueActionOpcode; readonly operands: Uint8Array }
export interface DialogueMenuOption { readonly bytes: Uint8Array; readonly text: string; readonly targetSlot: number }
export interface DialogueMenuToken { readonly kind: "menu"; readonly offset: number; readonly options: DialogueMenuOption[] }
export type DialogueToken = DialogueTextToken | DialogueControlToken | DialogueActionToken | DialogueMenuToken;

export interface DialogueVariant {
  readonly pointerTableSlot: number;
  readonly textAddress: number;
  readonly bytes: Uint8Array;
  readonly tokens: DialogueToken[];
  readonly pages: string[];
}

export interface DialogueEntity {
  readonly areaIndex: number;
  readonly entityIndex: number;
  readonly name: string;
  readonly entityAddress: number;
  readonly variants: DialogueVariant[];
}

export type DialogueTokenInspection =
  | { readonly kind: "text"; readonly offset: number; readonly text: string }
  | { readonly kind: "control"; readonly offset: number; readonly opcode: number; readonly operands: readonly number[]; readonly phase: "pre-text" | "inline-text" }
  | { readonly kind: "action"; readonly offset: number; readonly opcode: number; readonly operands: readonly number[] }
  | { readonly kind: "menu"; readonly offset: number; readonly options: readonly { readonly text: string; readonly targetSlot: number; readonly bytes: readonly number[] }[] };

export interface DialogueVariantInspection {
  readonly slot: number;
  readonly textAddress: number;
  readonly bytes: readonly number[];
  readonly pages: readonly string[];
  readonly tokens: readonly DialogueTokenInspection[];
}

export interface DialogueEntityInspection {
  readonly areaIndex: number;
  readonly entityIndex: number;
  readonly entityName: string;
  readonly entityAddress: number;
  readonly variants: readonly DialogueVariantInspection[];
}

/** Serializable, order-preserving dump for executable dialogue archaeology. */
export function inspectDialogueEntity(entity: DialogueEntity): DialogueEntityInspection {
  return {
    areaIndex: entity.areaIndex,
    entityIndex: entity.entityIndex,
    entityName: entity.name,
    entityAddress: entity.entityAddress,
    variants: entity.variants.map((variant) => ({
      slot: variant.pointerTableSlot,
      textAddress: variant.textAddress,
      bytes: [...variant.bytes],
      pages: variant.pages,
      tokens: variant.tokens.map((token): DialogueTokenInspection => {
        if (token.kind === "text") return { kind: token.kind, offset: token.offset, text: token.text };
        if (token.kind === "control") return { kind: token.kind, offset: token.offset, opcode: token.opcode, operands: [...token.operands], phase: token.phase };
        if (token.kind === "action") return { kind: token.kind, offset: token.offset, opcode: token.opcode, operands: [...token.operands] };
        return {
          kind: token.kind,
          offset: token.offset,
          options: token.options.map((option) => ({ text: option.text, targetSlot: option.targetSlot, bytes: [...option.bytes] })),
        };
      }),
    })),
  };
}

const preTextOperandCounts = [0, 2, 2, 3, 1, 2, 2, 1, 2, 0, 0, 2, 0, 2, 6, 1, 1, 2, 0, 1, 2, 1, 1, 1, 1, 2, 2, 1, 2, 3] as const;
const actionOperandCounts = [0, 2, 2, 1, 1, 3, 1, 2, 2, -1, 0, 2, 1, -1, 1, 0, 2, 2, 1, 1, 2, 3, 3, 0, 0] as const;
const dialogueRootAddress = 0x002a4620;
const maxVariantBytes = 4096;
const maxLocalVariantGap = 4096;

export interface DialogueTokenizeOptions { readonly restoreBoundedTrailingZeros?: boolean }

export function tokenizeDialogue(bytes: Uint8Array, options: DialogueTokenizeOptions = {}): DialogueToken[] {
  return tokenizeCore(bytes, options).tokens;
}

export function decodeDialoguePages(tokens: DialogueToken[]): string[] {
  const pages: string[] = [];
  let current = "";
  const flush = (): void => { const page = current.trim(); current = ""; if (page) pages.push(page); };
  for (const token of tokens) {
    if (token.kind === "text") current += token.text;
    else if (token.kind === "control" && token.opcode === DialogueOpcode.NewLine) current += "\n";
    else if (token.kind === "control" && token.opcode === DialogueOpcode.PageBreak) flush();
  }
  flush();
  return pages;
}

export function readDialogueEntity(executableBytes: Uint8Array, areaIndex: number, name: string, languageIndex = 0): DialogueEntity {
  if (!name.trim()) throw new Error("Dialogue entity name cannot be empty.");
  const { elf, areaTable, entityAddresses } = readDialogueArea(executableBytes, areaIndex, languageIndex);
  for (let entityIndex = 0; entityIndex < entityAddresses.length; entityIndex += 1) {
    const entityAddress = entityAddresses[entityIndex];
    if (entityAddress === undefined) continue;
    const nameAddress = elf.u32(entityAddress);
    if (!elf.isFileBacked(nameAddress) || elf.asciiZ(nameAddress, 128).toLowerCase() !== name.toLowerCase()) continue;
    return decodeDialogueEntity(elf, areaIndex, entityIndex, areaTable, entityAddresses);
  }
  throw new Error(`Dialogue entity '${name}' was not found in area ${areaIndex}.`);
}

/**
 * Fixed SHOP slot N maps to dialogue entity N in the same authored area. This
 * index relationship is more reliable than names: the overworld label can be
 * "Staff", use different spelling, or collapse numbered Quick-Pic variants.
 */
export function readDialogueEntityAtIndex(executableBytes: Uint8Array, areaIndex: number, entityIndex: number, languageIndex = 0): DialogueEntity {
  const { elf, areaTable, entityAddresses } = readDialogueArea(executableBytes, areaIndex, languageIndex);
  if (!Number.isInteger(entityIndex) || entityIndex < 0 || entityIndex >= entityAddresses.length) {
    throw new RangeError(`Dialogue entity index ${entityIndex} lies outside area ${areaIndex}'s ${entityAddresses.length} entities.`);
  }
  return decodeDialogueEntity(elf, areaIndex, entityIndex, areaTable, entityAddresses);
}

function readDialogueArea(executableBytes: Uint8Array, areaIndex: number, languageIndex: number): {
  elf: Elf32AddressSpace;
  areaTable: number;
  entityAddresses: number[];
} {
  if (languageIndex < 0 || languageIndex > 2 || areaIndex < 0 || areaIndex >= 32) throw new RangeError("Dialogue language or area index is out of range.");
  const elf = new Elf32AddressSpace(executableBytes);
  const languageTable = elf.u32(dialogueRootAddress + languageIndex * 4);
  if (languageTable === 0) throw new Error(`Dialogue language ${languageIndex} has no pointer table.`);
  const areaTable = elf.u32(languageTable + areaIndex * 4);
  if (areaTable === 0) throw new Error(`Dialogue area ${areaIndex} has no entity table.`);
  const entityAddresses: number[] = [];
  for (let index = 0; index < 128; index += 1) {
    const address = elf.u32(areaTable + index * 4);
    if (address === 0 || !elf.isFileBacked(address, 4) || address >= areaTable) break;
    entityAddresses.push(address);
  }
  return { elf, areaTable, entityAddresses };
}

function decodeDialogueEntity(
  elf: Elf32AddressSpace,
  areaIndex: number,
  entityIndex: number,
  areaTable: number,
  entityAddresses: readonly number[],
): DialogueEntity {
  const entityAddress = entityAddresses[entityIndex];
  if (entityAddress === undefined) throw new RangeError(`Dialogue entity index ${entityIndex} is unavailable in area ${areaIndex}.`);
  const nameAddress = elf.u32(entityAddress);
  if (!elf.isFileBacked(nameAddress)) throw new Error(`Dialogue entity ${entityIndex} in area ${areaIndex} has an invalid name pointer.`);
  const entityName = elf.asciiZ(nameAddress, 128);
  const entityEnd = entityAddresses[entityIndex + 1] ?? areaTable;
  const pointers: Array<{ slot: number; address: number }> = [];
  let slot = 1;
  for (let address = entityAddress + 4; address + 4 <= entityEnd; address += 4, slot += 1) {
    const textAddress = elf.u32(address);
    if (textAddress !== 0 && elf.isFileBacked(textAddress)) pointers.push({ slot, address: textAddress });
  }
  const localAddresses = [...new Set(pointers.map((pointer) => pointer.address))].sort((a, b) => a - b);
  const variants = pointers.map((pointer): DialogueVariant => {
    const next = localAddresses.find((address) => address > pointer.address && address - pointer.address <= maxLocalVariantGap);
    const length = next === undefined ? findFileBackedLength(elf, pointer.address, maxVariantBytes) : next - pointer.address;
    if (length <= 0 || length > maxVariantBytes) throw new Error(`Dialogue stream at 0x${pointer.address.toString(16)} has implausible length ${length}.`);
    const speculative = elf.bytes(pointer.address, length);
    // Some executable streams end exactly at the next stream address and omit
    // only trailing zero operands from a fixed-width action. The game observes
    // the same zero values; restore them only at this proven bounded edge.
    const parsed = tokenizeCore(speculative, { restoreBoundedTrailingZeros: next !== undefined });
    const bytes = parsed.consumedLength === speculative.length ? speculative : speculative.slice(0, parsed.consumedLength);
    const tokens = parsed.tokens;
    return { pointerTableSlot: pointer.slot, textAddress: pointer.address, bytes, tokens, pages: decodeDialoguePages(tokens) };
  });
  return { areaIndex, entityIndex, name: entityName, entityAddress, variants };
}

export function fallbackDialogueGreeting(entity: DialogueEntity): DialogueVariant {
  const candidates = [...entity.variants].reverse();
  const best = candidates.find((variant) => variant.pages.length > 0 &&
    !variant.tokens.some((token) => token.kind === "action" || token.kind === "menu") &&
    variant.tokens.filter((token): token is DialogueControlToken => token.kind === "control")
      .every((control) => control.opcode === DialogueOpcode.NewLine || control.opcode === DialogueOpcode.PageBreak));
  const fallback = best ?? candidates.find((variant) => variant.pages.length > 0);
  if (!fallback) throw new Error(`Dialogue entity '${entity.name}' contains no displayable variants.`);
  return fallback;
}

export function variantBySlot(entity: DialogueEntity, slot: number): DialogueVariant {
  if (slot <= 0) throw new RangeError("Dialogue slot zero is the exit sentinel.");
  const variant = entity.variants.find((candidate) => candidate.pointerTableSlot === slot);
  if (!variant) throw new Error(`Dialogue entity '${entity.name}' has no pointer-table slot 0x${slot.toString(16)}.`);
  return variant;
}

function tokenizeCore(bytes: Uint8Array, options: DialogueTokenizeOptions = {}): { tokens: DialogueToken[]; consumedLength: number } {
  const tokens: DialogueToken[] = [];
  let offset = 0, textStarted = false;
  while (offset < bytes.length) {
    const value = bytes[offset] ?? 0;
    if (value === 0) return { tokens, consumedLength: offset };
    if (!textStarted && value < 0x20) {
      if (value > 0x1d) { tokens.push({ kind: "control", offset, opcode: value, operands: new Uint8Array(), phase: "pre-text" }); offset += 1; continue; }
      const operandCount = preTextOperandCount(value);
      ensureAvailable(bytes, offset, operandCount, "pre-text opcode", value);
      tokens.push({ kind: "control", offset, opcode: value, operands: bytes.slice(offset + 1, offset + 1 + operandCount), phase: "pre-text" });
      offset += 1 + operandCount;
      continue;
    }
    textStarted = true;
    if (value >= 0x20) {
      const start = offset;
      while (offset < bytes.length && (bytes[offset] ?? 0) >= 0x20) offset += 1;
      tokens.push({ kind: "text", offset: start, text: new TextDecoder("latin1").decode(bytes.subarray(start, offset)) });
      continue;
    }
    if (value === DialogueOpcode.NewLine || value === DialogueOpcode.PageBreak) {
      tokens.push({ kind: "control", offset, opcode: value, operands: new Uint8Array(), phase: "inline-text" }); offset += 1; continue;
    }
    if (value === DialogueActionOpcode.Menu) {
      if ((bytes[offset + 1] ?? -1) === 0) {
        tokens.push({ kind: "action", offset, opcode: value, operands: new Uint8Array([0]) });
        return { tokens, consumedLength: offset + 2 };
      }
      const parsed = parseMenu(bytes, offset); tokens.push(parsed.token); return { tokens, consumedLength: parsed.end };
    }
    if (value >= actionOperandCounts.length) {
      tokens.push({ kind: "action", offset, opcode: value, operands: new Uint8Array() }); return { tokens, consumedLength: offset + 1 };
    }
    if (value === DialogueActionOpcode.RaceSelect) {
      ensureAvailable(bytes, offset, 1, "action", value);
      const width = bytes[offset + 1] === 0 ? 1 : 2;
      ensureAvailable(bytes, offset, width, "action", value);
      tokens.push({ kind: "action", offset, opcode: value, operands: bytes.slice(offset + 1, offset + 1 + width) });
      return { tokens, consumedLength: offset + 1 + width };
    }
    if (value === DialogueActionOpcode.GrantStamps) {
      let cursor = offset + 1;
      while (cursor < bytes.length && bytes[cursor] !== 0) cursor += 1;
      if (cursor >= bytes.length) throw new Error(`Dialogue action 0x${value.toString(16)} has no terminating zero.`);
      tokens.push({ kind: "action", offset, opcode: value, operands: bytes.slice(offset + 1, cursor) });
      return { tokens, consumedLength: cursor + 1 };
    }
    const operandCount = actionOperandCounts[value] ?? 0;
    if (operandCount < 0) throw new Error(`Dialogue action 0x${value.toString(16)} has an unhandled variable payload.`);
    const available = bytes.length - offset - 1;
    if (available < operandCount && options.restoreBoundedTrailingZeros && available > 0) {
      const supplied = bytes.slice(offset + 1);
      if (supplied.every((operand) => operand === 0)) {
        const operands = new Uint8Array(operandCount);
        operands.set(supplied);
        tokens.push({ kind: "action", offset, opcode: value, operands });
        return { tokens, consumedLength: bytes.length };
      }
    }
    ensureAvailable(bytes, offset, operandCount, "action", value);
    tokens.push({ kind: "action", offset, opcode: value, operands: bytes.slice(offset + 1, offset + 1 + operandCount) });
    return { tokens, consumedLength: offset + 1 + operandCount };
  }
  return { tokens, consumedLength: bytes.length };
}

function parseMenu(bytes: Uint8Array, opcodeOffset: number): { token: DialogueMenuToken; end: number } {
  let cursor = opcodeOffset + 1;
  const rawOptions: Uint8Array[] = [];
  while (cursor < bytes.length) {
    const start = cursor;
    while (cursor < bytes.length && bytes[cursor] !== 0) cursor += 1;
    if (cursor >= bytes.length) throw new Error(`Dialogue menu at +0x${opcodeOffset.toString(16)} has an unterminated option.`);
    rawOptions.push(bytes.slice(start, cursor)); cursor += 1;
    if (bytes[cursor] === DialogueActionOpcode.Menu) { cursor += 1; break; }
  }
  if (rawOptions.length === 0 || cursor + rawOptions.length > bytes.length) throw new Error("Dialogue menu has no options or target slots.");
  const options = rawOptions.map((raw, index): DialogueMenuOption => ({ bytes: raw, text: decodeMenuOption(raw), targetSlot: bytes[cursor + index] ?? 0 }));
  cursor += rawOptions.length;
  return { token: { kind: "menu", offset: opcodeOffset, options }, end: cursor };
}

function decodeMenuOption(bytes: Uint8Array): string {
  let text = "";
  for (const value of bytes) { if (value >= 0x20) text += String.fromCharCode(value); else if (value === DialogueOpcode.NewLine) text += "\n"; }
  return text.trim();
}

function preTextOperandCount(opcode: number): number {
  if (opcode < 1 || opcode > 0x1d) throw new RangeError(`Pre-text opcode 0x${opcode.toString(16)} is outside the traced range.`);
  return preTextOperandCounts[opcode] ?? 0;
}

function ensureAvailable(bytes: Uint8Array, offset: number, operands: number, kind: string, opcode: number): void {
  if (offset + 1 + operands > bytes.length) throw new Error(`Dialogue ${kind} 0x${opcode.toString(16)} at +0x${offset.toString(16)} is truncated.`);
}

function findFileBackedLength(elf: Elf32AddressSpace, address: number, maximum: number): number {
  if (maximum <= 0 || !elf.isFileBacked(address)) return 0;
  let low = 1, high = maximum;
  while (low < high) { const candidate = low + Math.floor((high - low + 1) / 2); if (elf.isFileBacked(address, candidate)) low = candidate; else high = candidate - 1; }
  return low;
}

export class DialogueRuntimeState {
  readonly flags = new Set<number>();
  /** PAL indexed flag banks. Bank 15 contains quest inventory items. */
  readonly indexedFlags = new Set<number>();
  /** Categories 1..14 use five parallel bit planes to store equipment copies. */
  private readonly indexedEquipmentCounts = new Map<number, number>();
  /** Original stamp collection IDs awarded by action 0x0d. */
  readonly stamps = new Set<number>();
  /** Original Quick-Pic completion bits, numbered 1..100 by the executable. */
  private readonly quickPicPhotos = new Set<number>();
  /** Fixed interactions whose executable first-meeting bit has been cleared. */
  private readonly metFixedInteractions = new Set<number>();
  private progressRevision = 0;
  currentAreaIndex = 1;
  rallyStage = 0;
  resultCode: number | undefined;
  teamIncomplete = false;
  worldGrandPrixUnlocked = false;

  hasIndexedFlag(namespace: number, index: number): boolean {
    return this.indexedFlagCount(namespace, index) > 0;
  }

  indexedFlagCount(namespace: number, index: number): number {
    const key = indexedFlagKey(namespace, index);
    return isEquipmentNamespace(namespace)
      ? this.indexedEquipmentCounts.get(key) ?? (this.indexedFlags.has(key) ? 1 : 0)
      : Number(this.indexedFlags.has(key));
  }

  get revision(): number {
    return this.progressRevision;
  }

  setIndexedFlag(namespace: number, index: number): boolean {
    const key = indexedFlagKey(namespace, index);
    if (isEquipmentNamespace(namespace)) {
      const count = this.indexedFlagCount(namespace, index);
      if (count >= 5) return false;
      this.indexedFlags.add(key);
      this.indexedEquipmentCounts.set(key, count + 1);
      this.progressRevision += 1;
      return true;
    }
    if (this.indexedFlags.has(key)) return false;
    this.indexedFlags.add(key);
    this.progressRevision += 1;
    return true;
  }

  clearIndexedFlag(namespace: number, index: number): boolean {
    const key = indexedFlagKey(namespace, index);
    if (isEquipmentNamespace(namespace)) {
      const count = this.indexedFlagCount(namespace, index);
      if (count === 0) return false;
      if (count === 1) {
        this.indexedEquipmentCounts.delete(key);
        this.indexedFlags.delete(key);
      } else {
        this.indexedEquipmentCounts.set(key, count - 1);
      }
      this.progressRevision += 1;
      return true;
    }
    const changed = this.indexedFlags.delete(key);
    if (changed) this.progressRevision += 1;
    return changed;
  }

  indexedFlagEntries(): readonly (readonly [number, number])[] {
    return [...this.indexedFlags]
      .sort((a, b) => a - b)
      .map((key) => Object.freeze([(key >>> 8) & 0xff, key & 0xff] as const));
  }

  indexedOwnershipEntries(): readonly (readonly [number, number, number])[] {
    return this.indexedFlagEntries().map(([namespace, index]) =>
      Object.freeze([namespace, index, this.indexedFlagCount(namespace, index)] as const));
  }

  addStamp(stampId: number): boolean {
    const value = stampId & 0xff;
    if (value === 0 || this.stamps.has(value)) return false;
    this.stamps.add(value);
    this.progressRevision += 1;
    return true;
  }

  stampEntries(): readonly number[] {
    return [...this.stamps].sort((a, b) => a - b);
  }

  hasStamp(stampId: number): boolean {
    return this.stamps.has(stampId & 0xff);
  }

  hasQuickPicPhoto(photoNumber: number): boolean {
    return isQuickPicPhotoNumber(photoNumber) && this.quickPicPhotos.has(photoNumber);
  }

  addQuickPicPhoto(photoNumber: number): boolean {
    if (!isQuickPicPhotoNumber(photoNumber) || this.quickPicPhotos.has(photoNumber)) return false;
    this.quickPicPhotos.add(photoNumber);
    this.progressRevision += 1;
    return true;
  }

  quickPicPhotoEntries(): readonly number[] {
    return [...this.quickPicPhotos].sort((a, b) => a - b);
  }

  isQuickPicComplete(): boolean {
    return this.quickPicPhotos.size === QUICK_PIC_PHOTO_COUNT;
  }

  hasMetFixedInteraction(areaIndex: number, localIndex: number): boolean {
    return this.metFixedInteractions.has(fixedInteractionKey(areaIndex, localIndex));
  }

  markFixedInteractionMet(areaIndex: number, localIndex: number): boolean {
    const key = fixedInteractionKey(areaIndex, localIndex);
    if (this.metFixedInteractions.has(key)) return false;
    this.metFixedInteractions.add(key);
    this.progressRevision += 1;
    return true;
  }

  metFixedInteractionEntries(): readonly (readonly [number, number])[] {
    return [...this.metFixedInteractions]
      .sort((a, b) => a - b)
      .map((key) => Object.freeze([(key >>> 5) & 0x1f, key & 0x1f] as const));
  }
}

function indexedFlagKey(namespace: number, index: number): number {
  return ((namespace & 0xff) << 8) | (index & 0xff);
}

function isEquipmentNamespace(namespace: number): boolean {
  const value = namespace & 0xff;
  return value >= 1 && value <= 14;
}

function fixedInteractionKey(areaIndex: number, localIndex: number): number {
  if (!Number.isInteger(areaIndex) || areaIndex < 0 || areaIndex >= 32) throw new RangeError("Fixed-interaction area index must be 0..31.");
  if (!Number.isInteger(localIndex) || localIndex < 0 || localIndex >= 32) throw new RangeError("Fixed-interaction local index must be 0..31.");
  return (areaIndex << 5) | localIndex;
}

export interface DialogueFlowChoice { readonly text: string; readonly targetSlot: number; readonly isDefault: boolean }

export class DialogueFlow {
  currentVariant: DialogueVariant | undefined;
  ended = false;
  pageIndex = 0;
  readonly ignoredControls: DialogueControlToken[] = [];

  private readonly firstInteraction: boolean;

  constructor(private readonly entity: DialogueEntity, private readonly state: DialogueRuntimeState, startSlot: number) {
    this.firstInteraction = !state.hasMetFixedInteraction(entity.areaIndex, entity.entityIndex);
    this.enterSlot(startSlot);
    // Native 0x0023e310 clears the (area, local slot) bit as the fixed
    // interaction opens, after the entry stream has observed its old value.
    state.markFixedInteractionMet(entity.areaIndex, entity.entityIndex);
  }
  get currentSlot(): number { return this.currentVariant?.pointerTableSlot ?? 0; }
  get currentPage(): string | undefined { const pages = this.currentVariant?.pages; return pages?.length ? pages[Math.max(0, Math.min(pages.length - 1, this.pageIndex))] : undefined; }
  get currentMenu(): DialogueMenuToken | undefined { return this.currentVariant?.tokens.find((token): token is DialogueMenuToken => token.kind === "menu"); }
  get currentAction(): DialogueActionToken | undefined { return this.currentVariant?.tokens.find((token): token is DialogueActionToken => token.kind === "action"); }
  get currentExternalAction(): DialogueActionToken | undefined {
    const action = this.currentAction;
    if (!action) return undefined;
    const yesNo = action.opcode === DialogueActionOpcode.YesNoDefaultFirst || action.opcode === DialogueActionOpcode.YesNoDefaultSecond;
    return yesNo && this.currentChoices.length === 2 ? undefined : action;
  }
  get currentChoices(): DialogueFlowChoice[] {
    if (this.currentMenu) {
      const choices = this.currentMenu.options.map((option) => ({ text: option.text, targetSlot: option.targetSlot, isDefault: false }));
      return choices.every((choice) => this.hasTarget(choice.targetSlot)) ? choices : [];
    }
    const action = this.currentAction;
    if (action && (action.opcode === DialogueActionOpcode.YesNoDefaultFirst || action.opcode === DialogueActionOpcode.YesNoDefaultSecond)) {
      const choices = [
        { text: "Yes", targetSlot: action.operands[0] ?? 0, isDefault: action.opcode === DialogueActionOpcode.YesNoDefaultFirst },
        { text: "No", targetSlot: action.operands[1] ?? 0, isDefault: action.opcode === DialogueActionOpcode.YesNoDefaultSecond },
      ];
      // Some still-uncertain streams end beside executable strings or tables.
      // Never offer a choice which would jump outside the entity and throw.
      return choices.every((choice) => this.hasTarget(choice.targetSlot)) ? choices : [];
    }
    return [];
  }
  advance(): void {
    if (this.ended || !this.currentVariant) return;
    if (this.pageIndex + 1 < this.currentVariant.pages.length) { this.pageIndex += 1; return; }
    if (this.currentChoices.length || this.currentExternalAction) return;
    this.ended = true; this.currentVariant = undefined;
  }
  choose(index: number): void { const choice = this.currentChoices[index]; if (!choice) throw new RangeError("Dialogue choice index is out of range."); this.enterSlot(choice.targetSlot); }
  returnFromExternalAction(slot: number): void { this.enterSlot(slot); }

  private hasTarget(slot: number): boolean {
    return slot === 0 || this.entity.variants.some((variant) => variant.pointerTableSlot === slot);
  }

  private enterSlot(slot: number): void {
    this.ignoredControls.length = 0; this.pageIndex = 0;
    if (slot === 0) { this.ended = true; this.currentVariant = undefined; return; }
    this.ended = false;
    let currentSlot = slot;
    for (let safety = 0; safety < 256; safety += 1) {
      const variant = variantBySlot(this.entity, currentSlot);
      let target = 0, branched = false;
      for (const control of variant.tokens.filter((token): token is DialogueControlToken => token.kind === "control" && token.phase === "pre-text")) {
        const op = control.operands;
        if (control.opcode === DialogueOpcode.BranchIfFlagSet && this.state.flags.has(op[0] ?? 0)) { target = op[1] ?? 0; branched = true; }
        else if (control.opcode === DialogueOpcode.BranchIfFlagClear && !this.state.flags.has(op[0] ?? 0)) { target = op[1] ?? 0; branched = true; }
        else if (control.opcode === DialogueOpcode.BranchIfIndexedFlagSet && this.state.hasIndexedFlag(op[0] ?? 0, op[1] ?? 0)) { target = op[2] ?? 0; branched = true; }
        else if (control.opcode === DialogueOpcode.BranchIfFirstInteraction && this.firstInteraction) { target = op[0] ?? 0; branched = true; }
        else if (control.opcode === DialogueOpcode.BranchIfQuickPicTaken && this.state.hasQuickPicPhoto(op[0] ?? 0)) { target = op[1] ?? 0; branched = true; }
        else if (control.opcode === DialogueOpcode.BranchIfStampSet && this.state.hasStamp(op[0] ?? 0)) { target = op[1] ?? 0; branched = true; }
        else if (control.opcode === DialogueOpcode.BranchIfResultCodeEquals && this.state.resultCode === op[0]) { target = op[1] ?? 0; branched = true; }
        else if (control.opcode === DialogueOpcode.BranchIfTeamIncomplete && this.state.teamIncomplete) { target = op[0] ?? 0; branched = true; }
        else if (control.opcode === DialogueOpcode.BranchByRallyStage && this.state.rallyStage >= 1 && this.state.rallyStage <= 6) { target = op[this.state.rallyStage - 1] ?? 0; branched = target !== 0; }
        else if (control.opcode === DialogueOpcode.SetFlag) this.state.flags.add(op[0] ?? 0);
        else if (control.opcode === DialogueOpcode.ClearFlag) this.state.flags.delete(op[0] ?? 0);
        else if (control.opcode === DialogueOpcode.ClearIndexedFlag) this.state.clearIndexedFlag(op[0] ?? 0, op[1] ?? 0);
        else if (control.opcode === DialogueOpcode.SetRallyStage) this.state.rallyStage = op[0] ?? 0;
        else if (control.opcode === DialogueOpcode.WorldGrandPrixUnlockGate && this.state.worldGrandPrixUnlocked) { target = op[0] ?? 0; branched = true; }
        else if (control.opcode === DialogueOpcode.BranchIfCurrentAreaEquals && this.state.currentAreaIndex === op[0]) { target = op[1] ?? 0; branched = true; }
        else if (![DialogueOpcode.SetFlag, DialogueOpcode.ClearFlag, DialogueOpcode.ClearIndexedFlag, DialogueOpcode.SetRallyStage].includes(control.opcode)) this.ignoredControls.push(control);
        if (branched) break;
      }
      if (branched) { if (target === 0) { this.ended = true; this.currentVariant = undefined; return; } currentSlot = target; continue; }
      this.currentVariant = variant; return;
    }
    throw new Error(`Dialogue entity '${this.entity.name}' exceeded the branch safety limit.`);
  }
}
