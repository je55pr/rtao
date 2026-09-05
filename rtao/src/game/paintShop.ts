import { RecoveredCommerceState } from "./commerceProgress";
import { RecoveredEquipmentState } from "./equipmentProgress";

export const nativePaintChannelValues = Object.freeze([25, 38, 51, 63, 76, 89, 102, 114, 127, 140, 153, 165, 178, 191, 204, 216]);
export const nativeBodyPaintPriceCake = 100;
export const nativeWheelPaintPriceCake = 100;

/** Exact PAL wheel-paint palette: RGB indices at 0x002a25b0 decoded through the 16-step intensity table. */
export const nativeWheelPaintPalette = Object.freeze([
  [178, 178, 178],
  [51, 51, 51],
  [204, 25, 25],
  [204, 102, 127],
  [25, 114, 25],
  [76, 178, 25],
  [38, 63, 204],
  [76, 165, 204],
  [191, 127, 25],
  [178, 178, 38],
  [114, 38, 127],
  [153, 102, 178],
] as const);

export const nativeWheelPaintCount = nativeWheelPaintPalette.length;

/**
 * Schema-5 browser saves predate native paint persistence. This word is the
 * nearest RGB444 representation of the port's established Q62 pink paints;
 * it is a compatibility seed, not a claim about original new-game selection.
 */
export const browserCompatibilityPaintWord = 0x00b8fcaf;

export type NativePaintTone = 0 | 1;
export type NativePaintChannel = 0 | 1 | 2;

export interface DecodedNativeBodyPaint {
  readonly primary: readonly [number, number, number];
  readonly secondary: readonly [number, number, number];
}

export type PaintPurchaseStatus = "painted" | "unchanged" | "insufficient-funds";

export interface PaintPurchaseResult {
  readonly status: PaintPurchaseStatus;
  readonly priceCake: number;
  readonly cakeBefore: number;
  readonly cakeAfter: number;
}

/** Native callback 0x00258878 prices any low-24-bit body-colour change at 100 Cake. */
export function nativeBodyPaintPrice(savedWord: number, draftWord: number): number {
  assertWord(savedWord);
  assertWord(draftWord);
  return ((savedWord ^ draftWord) & 0x00ff_ffff) === 0 ? 0 : nativeBodyPaintPriceCake;
}

/** Native callback 0x00258878 independently charges wheel-byte changes at 100 Cake. */
export function nativeWheelPaintPrice(savedWord: number, draftWord: number): number {
  assertWord(savedWord);
  assertWord(draftWord);
  return ((savedWord ^ draftWord) & 0xff00_0000) === 0 ? 0 : nativeWheelPaintPriceCake;
}

/** Complete native Paint Shop price: body 100 + wheels 100, so both changed = 200. */
export function nativePaintPrice(savedWord: number, draftWord: number): number {
  return nativeBodyPaintPrice(savedWord, draftWord) + nativeWheelPaintPrice(savedWord, draftWord);
}

export function nativeWheelPaintIndex(word: number): number {
  assertWord(word);
  const index = word >>> 24;
  if (index >= nativeWheelPaintCount) throw new RangeError(`Native wheel-paint index ${index} lies outside 0..${nativeWheelPaintCount - 1}.`);
  return index;
}

export function nativeWheelPaintColor(word: number): readonly [number, number, number] {
  return nativeWheelPaintPalette[nativeWheelPaintIndex(word)]!;
}

export function setNativeWheelPaintIndex(word: number, index: number): number {
  assertWord(word);
  if (!Number.isInteger(index) || index < 0 || index >= nativeWheelPaintCount) {
    throw new RangeError(`Native wheel-paint index must be in the 0..${nativeWheelPaintCount - 1} range.`);
  }
  return (((word & 0x00ff_ffff) >>> 0) | (index << 24)) >>> 0;
}

export function decodeNativeBodyPaint(word: number): DecodedNativeBodyPaint {
  assertWord(word);
  return {
    primary: decodeTone(word),
    secondary: decodeTone(word >>> 12),
  };
}

export function nativePaintChannel(word: number, tone: NativePaintTone, channel: NativePaintChannel): number {
  assertWord(word);
  return (word >>> (tone * 12 + channel * 4)) & 0x0f;
}

export function setNativePaintChannel(
  word: number,
  tone: NativePaintTone,
  channel: NativePaintChannel,
  value: number,
): number {
  assertWord(word);
  if (!Number.isInteger(value) || value < 0 || value > 15) throw new RangeError("Native paint channel must be in the 0..15 range.");
  const shift = tone * 12 + channel * 4;
  return ((word & ~(0x0f << shift)) | (value << shift)) >>> 0;
}

export class PaintShopSession {
  readonly savedWord: number;
  private currentWord: number;

  constructor(savedWord: number) {
    assertWord(savedWord);
    this.savedWord = savedWord >>> 0;
    this.currentWord = savedWord >>> 0;
  }

  get draftWord(): number {
    return this.currentWord;
  }

  get priceCake(): number {
    return nativePaintPrice(this.savedWord, this.currentWord);
  }

  get bodyPriceCake(): number {
    return nativeBodyPaintPrice(this.savedWord, this.currentWord);
  }

  get wheelPriceCake(): number {
    return nativeWheelPaintPrice(this.savedWord, this.currentWord);
  }

  setChannel(tone: NativePaintTone, channel: NativePaintChannel, value: number): void {
    this.currentWord = setNativePaintChannel(this.currentWord, tone, channel, value);
  }

  stepChannel(tone: NativePaintTone, channel: NativePaintChannel, direction: -1 | 1): void {
    const value = nativePaintChannel(this.currentWord, tone, channel);
    this.setChannel(tone, channel, Math.max(0, Math.min(15, value + direction)));
  }

  setWheelPaint(index: number): void {
    this.currentWord = setNativeWheelPaintIndex(this.currentWord, index);
  }

  stepWheelPaint(direction: -1 | 1): void {
    const value = nativeWheelPaintIndex(this.currentWord);
    this.setWheelPaint(Math.max(0, Math.min(nativeWheelPaintCount - 1, value + direction)));
  }

  reset(): void {
    this.currentWord = this.savedWord;
  }
}

/** Atomic browser equivalent of the complete native Paint Shop callback 0x00258878. */
export function purchasePaint(
  equipment: RecoveredEquipmentState,
  commerce: RecoveredCommerceState,
  draftWord: number,
): PaintPurchaseResult {
  assertWord(draftWord);
  // Native editor only permits wheel indices 0..11. Reject malformed external drafts
  // rather than persisting a byte the original UI could never produce.
  nativeWheelPaintIndex(draftWord);
  const savedWord = equipment.paintWord ?? browserCompatibilityPaintWord;
  const priceCake = nativePaintPrice(savedWord, draftWord);
  const cakeBefore = commerce.cake;
  if (priceCake === 0) return { status: "unchanged", priceCake, cakeBefore, cakeAfter: cakeBefore };
  if (!commerce.applyCakeMutation(priceCake)) {
    return { status: "insufficient-funds", priceCake, cakeBefore, cakeAfter: cakeBefore };
  }
  equipment.setPaintWord(draftWord);
  return { status: "painted", priceCake, cakeBefore, cakeAfter: commerce.cake };
}

/** Atomic browser equivalent of the body-colour half of native callback 0x00258878. */
export function purchaseBodyPaint(
  equipment: RecoveredEquipmentState,
  commerce: RecoveredCommerceState,
  draftWord: number,
): PaintPurchaseResult {
  assertWord(draftWord);
  const savedWord = equipment.paintWord ?? browserCompatibilityPaintWord;
  const priceCake = nativeBodyPaintPrice(savedWord, draftWord);
  const cakeBefore = commerce.cake;
  if (priceCake === 0) return { status: "unchanged", priceCake, cakeBefore, cakeAfter: cakeBefore };
  if (!commerce.applyCakeMutation(priceCake)) {
    return { status: "insufficient-funds", priceCake, cakeBefore, cakeAfter: cakeBefore };
  }
  equipment.setPaintWord(draftWord);
  return { status: "painted", priceCake, cakeBefore, cakeAfter: commerce.cake };
}

function decodeTone(value: number): readonly [number, number, number] {
  return [
    nativePaintChannelValues[value & 0x0f]!,
    nativePaintChannelValues[(value >>> 4) & 0x0f]!,
    nativePaintChannelValues[(value >>> 8) & 0x0f]!,
  ];
}

function assertWord(value: number): void {
  if (!Number.isInteger(value) || value < 0 || value > 0xffff_ffff) throw new RangeError("Native paint configuration must be an unsigned 32-bit word.");
}
