export const maximumCakeBalance = 999_999;
export const initialCakeBalance = 1_000;
export const advertisingSponsorCount = 5;
export const advertisingRedemptionDistanceUnits = 1_000;
const maximumAdvertisingDistanceUnits = 0x7fff_ffff;
/** New-game initializer 0x00229398 grants two normal parts in each category. */
export const initialEquipmentOwnership: readonly (readonly [number, number, number])[] = Object.freeze([
  [1, 0, 2],
  [2, 0, 2],
  [3, 0, 2],
  [4, 0, 2],
  [5, 0, 2],
  [6, 0, 2],
  [7, 0, 2],
]);

export interface IndexedOwnershipState {
  hasIndexedFlag(namespace: number, index: number): boolean;
  indexedFlagCount(namespace: number, index: number): number;
  setIndexedFlag(namespace: number, index: number): boolean;
  clearIndexedFlag(namespace: number, index: number): boolean;
}

export type IndexedPurchaseStatus = "purchased" | "already-owned" | "inventory-full" | "insufficient-funds";

export interface IndexedPurchaseResult {
  readonly status: IndexedPurchaseStatus;
  readonly cakeBefore: number;
  readonly cakeAfter: number;
}

export type IndexedSaleStatus = "sold" | "not-owned";

export interface IndexedSaleResult {
  readonly status: IndexedSaleStatus;
  readonly saleValueCake: number;
  readonly cakeBefore: number;
  readonly cakeAfter: number;
  readonly ownedBefore: number;
  readonly ownedAfter: number;
}

export type PartTransferValueMode = "seller-credit" | "recipient-debit";

export type AdvertisingRedemptionStatus = "credited" | "below-threshold";

export interface AdvertisingRedemptionResult {
  readonly status: AdvertisingRedemptionStatus;
  readonly sponsorIndex: number;
  readonly distanceBefore: number;
  readonly distanceAfter: number;
  readonly redeemedBlocks: number;
  readonly cakeAwarded: number;
  readonly cakeBefore: number;
  readonly cakeAfter: number;
}

/** PAL option category 11 items 4..8 carry flag 0x0200 and sponsor bytes 0..4. */
export function advertisingSponsorIndexFromOptionSelector(selector: number): number | undefined {
  return Number.isInteger(selector) && selector >= 4 && selector < 4 + advertisingSponsorCount
    ? selector - 4
    : undefined;
}

export interface NativePartTradeContextInput {
  readonly signedByte651: number;
  readonly signedByte674: number;
  readonly signedByte676: number;
  readonly flags12da: number;
  readonly bitset548: readonly [bigint, bigint];
  readonly statesFf0: readonly number[];
  readonly bitset518: readonly [bigint, bigint];
  readonly bitset508: readonly [bigint, bigint];
}

/**
 * Exact arithmetic from PAL helper 0x0023ebb8. Offset-labelled inputs avoid
 * inventing gameplay names for save fields whose producers are not yet mapped.
 */
export function calculateNativePartTradeContextScore(input: NativePartTradeContextInput): number {
  for (const [label, value] of [["+0x651", input.signedByte651], ["+0x674", input.signedByte674], ["+0x676", input.signedByte676]] as const) {
    if (!Number.isInteger(value) || value < -128 || value > 127) throw new RangeError(`Part-trade signed byte ${label} is invalid.`);
  }
  if (!Number.isInteger(input.flags12da) || input.flags12da < 0 || input.flags12da > 0xffff) {
    throw new RangeError("Part-trade +0x12da flags must be an unsigned 16-bit integer.");
  }
  if (input.statesFf0.length !== 25 || input.statesFf0.some((state) => !Number.isInteger(state) || state < 0 || state > 5)) {
    throw new RangeError("Part-trade +0xff0 state list must contain 25 values in the native 0..5 range.");
  }

  let score = input.signedByte674 !== 0 ? 10 : 0;
  if (input.signedByte676 !== 0) score += 10;
  for (let bit = 0; bit < 10; bit += 1) if ((input.flags12da & (1 << bit)) === 0) score += 2;
  score += input.signedByte651 * 20;

  const count548 = bitCount128(input.bitset548, "+0x548");
  score += count548 + (100 - count548) * 2;
  const stateWeights = [8, 4, 4, 3, 2, 1] as const;
  for (const state of input.statesFf0) score += stateWeights[state]!;
  score += bitCount128(input.bitset518, "+0x518") * 2;
  score += bitCount128(input.bitset508, "+0x508") * 2;
  return score;
}

/**
 * Exact integer formula from PAL helper 0x002456e8. The score inputs are the
 * composite car values returned by 0x0023ebb8; their runtime production is not
 * yet reconstructed, so this helper is evidence-locked but not UI-connected.
 */
export function calculatePartTransferValue(
  basePrice: number,
  selectedCarScore: number,
  otherCarScore: number,
  mode: PartTransferValueMode,
): number {
  for (const [label, value] of [["base price", basePrice], ["selected score", selectedCarScore], ["other score", otherCarScore]] as const) {
    if (!Number.isInteger(value) || value < -0x8000_0000 || value > 0x7fff_ffff) {
      throw new RangeError(`Part-transfer ${label} must be a signed 32-bit integer.`);
    }
  }
  if (basePrice < 0) throw new RangeError("Part-transfer base price must be non-negative.");
  const difference = selectedCarScore - otherCarScore;
  return mode === "seller-credit"
    ? Math.trunc(basePrice * (difference + 3_000) / 4_000)
    : Math.trunc(basePrice * (2_000 - difference) / 2_000);
}

/** Seeds the seven executable-proven normal parts for the browser's player slot. */
export function seedInitialEquipmentOwnership(ownership: IndexedOwnershipState): number {
  let added = 0;
  for (const [namespace, index, count] of initialEquipmentOwnership) {
    while (ownership.indexedFlagCount(namespace, index) < count) {
      if (ownership.setIndexedFlag(namespace, index)) added += 1;
      else break;
    }
  }
  return added;
}

/**
 * Executable-proven Cake field semantics from PAL helper 0x0023f7b8.
 * Positive amounts debit, negative amounts credit, unaffordable debits are
 * rejected without mutation, and successful credits cap at 999,999.
 */
export class RecoveredCommerceState {
  private cakeBalance = 0;
  private advertisingDistance = Array<number>(advertisingSponsorCount).fill(0);
  private progressRevision = 0;

  constructor(initialCake = initialCakeBalance) {
    this.restoreCake(initialCake);
  }

  get cake(): number {
    return this.cakeBalance;
  }

  get revision(): number {
    return this.progressRevision;
  }

  advertisingDistanceEntries(): readonly number[] {
    return [...this.advertisingDistance];
  }

  /** Restores a validated persisted value without manufacturing a mutation. */
  restoreCake(value: number): boolean {
    if (!Number.isInteger(value) || value < 0 || value > maximumCakeBalance) return false;
    this.cakeBalance = value;
    return true;
  }

  /** Restores the five executable advertising counters without creating a mutation. */
  restoreAdvertisingDistanceUnits(value: unknown): boolean {
    if (!Array.isArray(value) || value.length !== advertisingSponsorCount) return false;
    if (value.some((entry) => !Number.isInteger(entry) || entry < 0 || entry > maximumAdvertisingDistanceUnits)) return false;
    this.advertisingDistance = [...value] as number[];
    return true;
  }

  /** Adds integer browser world-distance units to one PAL sponsor counter. */
  addAdvertisingDistanceUnits(sponsorIndex: number, distanceUnits: number): boolean {
    validateAdvertisingSponsorIndex(sponsorIndex);
    if (!Number.isInteger(distanceUnits) || distanceUnits < 0 || distanceUnits > maximumAdvertisingDistanceUnits) {
      throw new RangeError("Advertising distance must be a non-negative signed 32-bit integer.");
    }
    if (distanceUnits === 0) return false;
    const next = this.advertisingDistance[sponsorIndex]! + distanceUnits;
    if (next > maximumAdvertisingDistanceUnits) throw new RangeError("Advertising distance exceeds the native signed 32-bit counter range.");
    this.advertisingDistance[sponsorIndex] = next;
    this.progressRevision += 1;
    return true;
  }

  /** Mirrors PAL callback 0x0023bad0: consume whole 1,000-unit blocks and retain the remainder. */
  redeemAdvertisingCake(sponsorIndex: number): AdvertisingRedemptionResult {
    validateAdvertisingSponsorIndex(sponsorIndex);
    const distanceBefore = this.advertisingDistance[sponsorIndex]!;
    const redeemedBlocks = Math.trunc(distanceBefore / advertisingRedemptionDistanceUnits);
    const cakeAwarded = redeemedBlocks * 10 * (sponsorIndex + 1);
    const cakeBefore = this.cakeBalance;
    if (redeemedBlocks === 0) {
      return {
        status: "below-threshold", sponsorIndex, distanceBefore, distanceAfter: distanceBefore,
        redeemedBlocks, cakeAwarded, cakeBefore, cakeAfter: cakeBefore,
      };
    }
    const distanceAfter = distanceBefore - redeemedBlocks * advertisingRedemptionDistanceUnits;
    this.advertisingDistance[sponsorIndex] = distanceAfter;
    this.progressRevision += 1;
    if (!this.applyCakeMutation(-cakeAwarded)) throw new Error("Native advertising Cake credit unexpectedly failed.");
    return {
      status: "credited", sponsorIndex, distanceBefore, distanceAfter,
      redeemedBlocks, cakeAwarded, cakeBefore, cakeAfter: this.cakeBalance,
    };
  }

  /** Mirrors the original helper's amount sign convention. */
  applyCakeMutation(amount: number): boolean {
    if (!Number.isInteger(amount) || amount < -0x8000_0000 || amount > 0x7fff_ffff) {
      throw new RangeError("Cake mutation amount must be a signed 32-bit integer.");
    }
    if (amount > this.cakeBalance) return false;
    const next = Math.min(maximumCakeBalance, this.cakeBalance - amount);
    if (next === this.cakeBalance) return true;
    this.cakeBalance = next;
    this.progressRevision += 1;
    return true;
  }
}

/**
 * Atomic browser equivalent of the executable's checked ownership purchase.
 * The caller supplies the evidence-backed ownership namespace and item ID.
 */
export function purchaseIndexedItem(
  ownership: IndexedOwnershipState,
  commerce: RecoveredCommerceState,
  namespace: number,
  index: number,
  priceCake: number,
): IndexedPurchaseResult {
  if (!isByte(namespace) || !isByte(index)) throw new RangeError("Indexed ownership coordinates must be bytes.");
  if (!Number.isInteger(priceCake) || priceCake < 0 || priceCake > 0x7fff_ffff) throw new RangeError("Purchase price must be a non-negative signed 32-bit integer.");
  const cakeBefore = commerce.cake;
  const count = ownership.indexedFlagCount(namespace, index);
  const capacity = namespace >= 1 && namespace <= 14 ? 5 : 1;
  if (count >= capacity) {
    return { status: capacity === 1 ? "already-owned" : "inventory-full", cakeBefore, cakeAfter: cakeBefore };
  }
  if (priceCake > cakeBefore) return { status: "insufficient-funds", cakeBefore, cakeAfter: cakeBefore };
  // The native host checks affordability before setting ownership and debiting.
  // These two local mutations cannot yield to another task, so they commit as
  // one transaction from the browser host's perspective.
  ownership.setIndexedFlag(namespace, index);
  if (!commerce.applyCakeMutation(priceCake)) throw new Error("Checked Cake debit unexpectedly failed.");
  return { status: "purchased", cakeBefore, cakeAfter: commerce.cake };
}

/** PAL Second-hand shop path 0x0026c1f0..0x0026c220 removes one copy and credits floor(base price / 2). */
export function sellIndexedPart(
  ownership: IndexedOwnershipState,
  commerce: RecoveredCommerceState,
  namespace: number,
  index: number,
  basePriceCake: number,
): IndexedSaleResult {
  if (!isByte(namespace) || namespace < 1 || namespace > 14 || !isByte(index)) {
    throw new RangeError("Second-hand ownership coordinates must identify a native part category 1..14 and byte item index.");
  }
  if (!Number.isInteger(basePriceCake) || basePriceCake < 0 || basePriceCake > 0x7fff_ffff) {
    throw new RangeError("Second-hand base price must be a non-negative signed 32-bit integer.");
  }
  const ownedBefore = ownership.indexedFlagCount(namespace, index);
  const cakeBefore = commerce.cake;
  const saleValueCake = Math.trunc(basePriceCake / 2);
  if (ownedBefore <= 0) {
    return { status: "not-owned", saleValueCake, cakeBefore, cakeAfter: cakeBefore, ownedBefore, ownedAfter: ownedBefore };
  }
  if (!ownership.clearIndexedFlag(namespace, index)) throw new Error("Owned second-hand part could not be removed.");
  if (!commerce.applyCakeMutation(-saleValueCake)) throw new Error("Native second-hand Cake credit unexpectedly failed.");
  return {
    status: "sold", saleValueCake, cakeBefore, cakeAfter: commerce.cake,
    ownedBefore, ownedAfter: ownership.indexedFlagCount(namespace, index),
  };
}

function isByte(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value <= 0xff;
}

function validateAdvertisingSponsorIndex(value: number): void {
  if (!Number.isInteger(value) || value < 0 || value >= advertisingSponsorCount) {
    throw new RangeError(`Advertising sponsor index must be in the native 0..${advertisingSponsorCount - 1} range.`);
  }
}

function bitCount128(words: readonly [bigint, bigint], label: string): number {
  let count = 0;
  for (let word of words) {
    if (word < 0n || word > 0xffff_ffff_ffff_ffffn) throw new RangeError(`Part-trade ${label} words must be unsigned 64-bit integers.`);
    while (word !== 0n) {
      count += Number(word & 1n);
      word >>= 1n;
    }
  }
  return count;
}
