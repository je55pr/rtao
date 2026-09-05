import { describe, expect, it } from "vitest";
import { knownNativePart } from "./parts";
import {
  PartsShopCatalogueSession,
  peachPartsShopStock,
  reconstructedSecondHandInventory,
  reconstructedSecondHandStock,
  reconstructedPartsShopStock,
} from "./shopCatalog";

describe("Peach Parts Shop catalogue", () => {
  it("keeps the evidence-backed Peach stock and Cake prices", () => {
    expect(peachPartsShopStock).toHaveLength(9);
    expect(peachPartsShopStock.map((item) => [item.name, item.priceCake])).toEqual([
      ["Sports Tyre", 1_000],
      ["Off Road Tyre", 500],
      ["Panther", 500],
      ["Quick", 500],
      ["Soft Pad", 1_000],
      ["Mesh", 500],
      ["Spoke 1", 500],
      ["Air Horn", 1_000],
      ["Digital Meter", 100],
    ]);
    expect(reconstructedPartsShopStock(1)).toBe(peachPartsShopStock);
    expect(reconstructedPartsShopStock(2)).toBeUndefined();
  });

  it("offers only owned, exactly priced entries at the Second-hand shop", () => {
    const counts = new Map([["1:0", 2], ["6:1", 1]]);
    const inventory = reconstructedSecondHandInventory({
      indexedFlagCount: (namespace, index) => counts.get(`${namespace}:${index}`) ?? 0,
    });
    expect(reconstructedSecondHandStock.slice(0, 6).map((item) => [item.name, item.priceCake])).toEqual([
      ["Normal Tyre", 200], ["Normal Engine", 200], ["Normal Chassis", 200],
      ["Normal Transmission", 200], ["Normal Steering", 200], ["Normal Pad", 500],
    ]);
    expect(inventory.map((item) => [item.name, item.priceCake])).toEqual([["Normal Tyre", 200], ["Soft Pad", 1_000]]);
  });

  it("maps each stock entry to its original indexed-ownership coordinate", () => {
    expect(peachPartsShopStock.map((item) => [item.name, item.nativeCategory, item.nativeItemIndex])).toEqual([
      ["Sports Tyre", 1, 1],
      ["Off Road Tyre", 1, 7],
      ["Panther", 2, 1],
      ["Quick", 5, 1],
      ["Soft Pad", 6, 1],
      ["Mesh", 7, 1],
      ["Spoke 1", 7, 2],
      ["Air Horn", 13, 1],
      ["Digital Meter", 14, 1],
    ]);
  });


  it("gives every Peach stock coordinate a mapped Q's Factory identity", () => {
    for (const item of peachPartsShopStock) {
      const fitting = knownNativePart(item.nativeCategory, item.nativeItemIndex);
      expect(fitting, `${item.name} ${item.nativeCategory}:${item.nativeItemIndex}`).toBeDefined();
    }
    expect(knownNativePart(13, 1)?.name).toBe("Air Horn");
    expect(knownNativePart(7, 2)?.name).toBe("Spoke 1");
  });

  it("wraps across only the categories that Peach actually sells", () => {
    const session = new PartsShopCatalogueSession(peachPartsShopStock);
    expect(session.category).toBe("tyres");
    expect(session.selectedItem.name).toBe("Sports Tyre");
    session.moveItem(-1);
    expect(session.selectedItem.name).toBe("Off Road Tyre");
    session.moveCategory(-1);
    expect(session.category).toBe("meters");
    expect(session.selectedItem.name).toBe("Digital Meter");
  });
});
