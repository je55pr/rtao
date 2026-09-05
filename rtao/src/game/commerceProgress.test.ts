import { describe, expect, test } from "vitest";
import { DialogueRuntimeState } from "../formats/dialogue";
import {
  advertisingSponsorIndexFromOptionSelector,
  initialCakeBalance,
  initialEquipmentOwnership,
  calculateNativePartTradeContextScore,
  calculatePartTransferValue,
  maximumCakeBalance,
  purchaseIndexedItem,
  sellIndexedPart,
  RecoveredCommerceState,
  seedInitialEquipmentOwnership,
} from "./commerceProgress";

describe("recovered PAL commerce state", () => {
  test("starts a fresh slot with the executable-proven 1,000 Cake", () => {
    expect(initialCakeBalance).toBe(1_000);
    expect(new RecoveredCommerceState().cake).toBe(1_000);
  });

  test("seeds the executable-proven normal parts in categories one through seven", () => {
    const ownership = new DialogueRuntimeState();
    expect(initialEquipmentOwnership).toEqual([[1, 0, 2], [2, 0, 2], [3, 0, 2], [4, 0, 2], [5, 0, 2], [6, 0, 2], [7, 0, 2]]);
    expect(seedInitialEquipmentOwnership(ownership)).toBe(14);
    expect(seedInitialEquipmentOwnership(ownership)).toBe(0);
    expect(ownership.indexedOwnershipEntries()).toEqual(initialEquipmentOwnership);
  });

  test("matches signed Cake debit, credit, rejection and cap semantics", () => {
    const commerce = new RecoveredCommerceState(750);
    expect(commerce.applyCakeMutation(500)).toBe(true);
    expect(commerce.cake).toBe(250);
    expect(commerce.applyCakeMutation(251)).toBe(false);
    expect(commerce.cake).toBe(250);
    expect(commerce.applyCakeMutation(-1_500_000)).toBe(true);
    expect(commerce.cake).toBe(maximumCakeBalance);
    expect(commerce.revision).toBe(2);
  });

  test("maps only the five PAL fitted-sign option selectors to sponsor counters", () => {
    expect([3, 4, 5, 6, 7, 8, 9].map(advertisingSponsorIndexFromOptionSelector)).toEqual([
      undefined, 0, 1, 2, 3, 4, undefined,
    ]);
  });

  test("accumulates sponsor distance and redeems complete 1,000-unit blocks with the native rate", () => {
    const commerce = new RecoveredCommerceState(1_000);
    expect(commerce.addAdvertisingDistanceUnits(2, 999)).toBe(true);
    expect(commerce.redeemAdvertisingCake(2)).toEqual({
      status: "below-threshold", sponsorIndex: 2,
      distanceBefore: 999, distanceAfter: 999, redeemedBlocks: 0,
      cakeAwarded: 0, cakeBefore: 1_000, cakeAfter: 1_000,
    });
    expect(commerce.addAdvertisingDistanceUnits(2, 1_501)).toBe(true);
    expect(commerce.redeemAdvertisingCake(2)).toEqual({
      status: "credited", sponsorIndex: 2,
      distanceBefore: 2_500, distanceAfter: 500, redeemedBlocks: 2,
      cakeAwarded: 60, cakeBefore: 1_000, cakeAfter: 1_060,
    });
    expect(commerce.advertisingDistanceEntries()).toEqual([0, 0, 500, 0, 0]);
  });

  test("consumes redeemed advertising blocks even when the Cake balance is capped", () => {
    const commerce = new RecoveredCommerceState(maximumCakeBalance);
    commerce.addAdvertisingDistanceUnits(4, 1_234);
    expect(commerce.redeemAdvertisingCake(4)).toMatchObject({
      status: "credited", distanceAfter: 234, cakeAwarded: 50,
      cakeBefore: maximumCakeBalance, cakeAfter: maximumCakeBalance,
    });
    expect(commerce.advertisingDistanceEntries()).toEqual([0, 0, 0, 0, 234]);
  });

  test("rejects an unaffordable Body Shop purchase without partial ownership", () => {
    const ownership = new DialogueRuntimeState();
    const commerce = new RecoveredCommerceState(499);
    expect(purchaseIndexedItem(ownership, commerce, 0, 13, 500)).toEqual({
      status: "insufficient-funds", cakeBefore: 499, cakeAfter: 499,
    });
    expect(ownership.hasIndexedFlag(0, 13)).toBe(false);
    expect(commerce.revision).toBe(0);
  });

  test("sets namespace-zero body ownership, debits once and rejects duplicate charging", () => {
    const ownership = new DialogueRuntimeState();
    const commerce = new RecoveredCommerceState(1_000);
    expect(purchaseIndexedItem(ownership, commerce, 0, 13, 500).status).toBe("purchased");
    expect(ownership.hasIndexedFlag(0, 13)).toBe(true);
    expect(commerce.cake).toBe(500);
    expect(purchaseIndexedItem(ownership, commerce, 0, 13, 500)).toEqual({
      status: "already-owned", cakeBefore: 500, cakeAfter: 500,
    });
    expect(commerce.cake).toBe(500);
  });

  test("allows up to five equipment copies before the native inventory-full result", () => {
    const ownership = new DialogueRuntimeState();
    const commerce = new RecoveredCommerceState(1_000);
    for (let copy = 1; copy <= 5; copy += 1) {
      expect(purchaseIndexedItem(ownership, commerce, 14, 1, 100).status).toBe("purchased");
      expect(ownership.indexedFlagCount(14, 1)).toBe(copy);
    }
    expect(purchaseIndexedItem(ownership, commerce, 14, 1, 100)).toEqual({
      status: "inventory-full", cakeBefore: 500, cakeAfter: 500,
    });
    expect(commerce.cake).toBe(500);
  });

  test("removes one equipment copy at a time while boolean banks remain single flags", () => {
    const ownership = new DialogueRuntimeState();
    seedInitialEquipmentOwnership(ownership);
    expect(ownership.clearIndexedFlag(1, 0)).toBe(true);
    expect(ownership.indexedFlagCount(1, 0)).toBe(1);
    expect(ownership.hasIndexedFlag(1, 0)).toBe(true);
    expect(ownership.clearIndexedFlag(1, 0)).toBe(true);
    expect(ownership.indexedFlagCount(1, 0)).toBe(0);

    ownership.setIndexedFlag(15, 39);
    expect(ownership.setIndexedFlag(15, 39)).toBe(false);
    expect(ownership.indexedFlagCount(15, 39)).toBe(1);
  });

  test("matches the Second-hand shop one-copy removal and floor-half Cake credit", () => {
    const ownership = new DialogueRuntimeState();
    const commerce = new RecoveredCommerceState(999_900);
    ownership.setIndexedFlag(1, 1);
    ownership.setIndexedFlag(1, 1);

    expect(sellIndexedPart(ownership, commerce, 1, 1, 1_001)).toEqual({
      status: "sold", saleValueCake: 500, cakeBefore: 999_900, cakeAfter: 999_999, ownedBefore: 2, ownedAfter: 1,
    });
    expect(sellIndexedPart(ownership, commerce, 1, 1, 1_001)).toMatchObject({ status: "sold", ownedAfter: 0 });
    expect(sellIndexedPart(ownership, commerce, 1, 1, 1_001)).toMatchObject({ status: "not-owned", ownedAfter: 0 });
  });

  test("matches the executable's context-adjusted teammate transfer values", () => {
    expect(calculatePartTransferValue(1_000, 3_000, 3_000, "seller-credit")).toBe(750);
    expect(calculatePartTransferValue(1_000, 3_000, 3_000, "recipient-debit")).toBe(1_000);
    expect(calculatePartTransferValue(1_000, 3_500, 3_000, "seller-credit")).toBe(875);
    expect(calculatePartTransferValue(1_000, 3_000, 3_500, "recipient-debit")).toBe(1_250);
    expect(() => calculatePartTransferValue(-1, 0, 0, "seller-credit")).toThrow(RangeError);
  });

  test("matches the complete offset-labelled native trade context score", () => {
    const empty = {
      signedByte651: 0,
      signedByte674: 0,
      signedByte676: 0,
      flags12da: 0,
      bitset548: [0n, 0n] as const,
      statesFf0: Array(25).fill(0),
      bitset518: [0n, 0n] as const,
      bitset508: [0n, 0n] as const,
    };
    // 20 from the ten clear flag bits, 200 from +0x548, and 25*8 states.
    expect(calculateNativePartTradeContextScore(empty)).toBe(420);
    expect(calculateNativePartTradeContextScore({
      ...empty,
      signedByte651: 3,
      signedByte674: 1,
      signedByte676: 1,
      flags12da: 0x03ff,
      bitset548: [0b1111n, 0n],
      statesFf0: [0, 1, 2, 3, 4, 5, ...Array(19).fill(5)],
      bitset518: [0b111n, 0n],
      bitset508: [0n, 1n << 63n],
    })).toBe(60 + 20 + 196 + 41 + 6 + 2);
    expect(() => calculateNativePartTradeContextScore({ ...empty, statesFf0: [0] })).toThrow(RangeError);
  });
});
