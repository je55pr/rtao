import { describe, expect, test } from "vitest";
import { RecoveredCommerceState } from "./commerceProgress";
import { RecoveredEquipmentState } from "./equipmentProgress";
import {
  browserCompatibilityPaintWord,
  decodeNativeBodyPaint,
  nativeBodyPaintPrice,
  nativePaintChannel,
  nativePaintPrice,
  nativeWheelPaintColor,
  nativeWheelPaintIndex,
  nativeWheelPaintPalette,
  PaintShopSession,
  purchaseBodyPaint,
  purchasePaint,
} from "./paintShop";

describe("native Paint Shop paint transaction", () => {
  test("decodes and edits both RGB444 tones with the executable intensity table", () => {
    const session = new PaintShopSession(0x120f_000f);
    expect(decodeNativeBodyPaint(session.draftWord)).toEqual({
      primary: [216, 25, 25],
      secondary: [25, 216, 25],
    });
    session.setChannel(1, 2, 15);
    expect(nativePaintChannel(session.draftWord, 1, 2)).toBe(15);
    session.stepChannel(0, 0, 1);
    expect(nativePaintChannel(session.draftWord, 0, 0)).toBe(15);
  });

  test("prices unchanged body paint at zero and any low-24-bit change at 100 Cake", () => {
    expect(nativeBodyPaintPrice(0x12abcdef, 0x12abcdef)).toBe(0);
    expect(nativeBodyPaintPrice(0x12abcdef, 0x12abcdee)).toBe(100);
    // The separately decoded wheel byte does not affect body-only pricing.
    expect(nativeBodyPaintPrice(0x12abcdef, 0x34abcdef)).toBe(0);
  });

  test("rejects insufficient funds without changing paint or Cake", () => {
    const equipment = new RecoveredEquipmentState();
    const commerce = new RecoveredCommerceState(99);
    const draft = browserCompatibilityPaintWord ^ 1;
    expect(purchaseBodyPaint(equipment, commerce, draft)).toEqual({
      status: "insufficient-funds", priceCake: 100, cakeBefore: 99, cakeAfter: 99,
    });
    expect(equipment.paintWord).toBeUndefined();
    expect(commerce.cake).toBe(99);
  });

  test("debits exactly 100 Cake once and stores the complete configuration word", () => {
    const equipment = new RecoveredEquipmentState();
    const commerce = new RecoveredCommerceState(1_000);
    const draft = browserCompatibilityPaintWord ^ 0x10;
    expect(purchaseBodyPaint(equipment, commerce, draft)).toEqual({
      status: "painted", priceCake: 100, cakeBefore: 1_000, cakeAfter: 900,
    });
    expect(equipment.paintWord).toBe(draft);
    expect(purchaseBodyPaint(equipment, commerce, draft).status).toBe("unchanged");
    expect(commerce.cake).toBe(900);
  });


  test("decodes the exact twelve-step PAL wheel palette from the packed high byte", () => {
    expect(nativeWheelPaintPalette).toHaveLength(12);
    expect(nativeWheelPaintPalette[0]).toEqual([178, 178, 178]);
    expect(nativeWheelPaintPalette[2]).toEqual([204, 25, 25]);
    expect(nativeWheelPaintPalette[7]).toEqual([76, 165, 204]);
    expect(nativeWheelPaintPalette[11]).toEqual([153, 102, 178]);
    expect(nativeWheelPaintIndex(0x0700_0000)).toBe(7);
    expect(nativeWheelPaintColor(0x0700_0000)).toEqual([76, 165, 204]);
  });

  test("prices body and wheel changes independently at 100 Cake each", () => {
    const saved = 0x00ab_cdef;
    expect(nativePaintPrice(saved, saved)).toBe(0);
    expect(nativePaintPrice(saved, saved ^ 0x0000_0001)).toBe(100);
    expect(nativePaintPrice(saved, 0x01ab_cdef)).toBe(100);
    expect(nativePaintPrice(saved, 0x01ab_cdee)).toBe(200);
  });

  test("combined native purchase atomically charges 200 Cake and stores body plus wheel byte", () => {
    const equipment = new RecoveredEquipmentState();
    const commerce = new RecoveredCommerceState(1_000);
    const saved = browserCompatibilityPaintWord;
    const session = new PaintShopSession(saved);
    session.stepChannel(0, 0, -1);
    session.setWheelPaint(2);
    expect(session.bodyPriceCake).toBe(100);
    expect(session.wheelPriceCake).toBe(100);
    expect(session.priceCake).toBe(200);
    expect(purchasePaint(equipment, commerce, session.draftWord)).toEqual({
      status: "painted", priceCake: 200, cakeBefore: 1_000, cakeAfter: 800,
    });
    expect(equipment.paintWord).toBe(session.draftWord);
    expect(nativeWheelPaintIndex(equipment.paintWord!)).toBe(2);
  });

  test("combined purchase rejects insufficient funds without storing either half", () => {
    const equipment = new RecoveredEquipmentState();
    const commerce = new RecoveredCommerceState(199);
    const session = new PaintShopSession(browserCompatibilityPaintWord);
    session.stepChannel(0, 0, -1);
    session.setWheelPaint(3);
    expect(purchasePaint(equipment, commerce, session.draftWord)).toEqual({
      status: "insufficient-funds", priceCake: 200, cakeBefore: 199, cakeAfter: 199,
    });
    expect(equipment.paintWord).toBeUndefined();
    expect(commerce.cake).toBe(199);
  });
});
