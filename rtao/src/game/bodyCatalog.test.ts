import { describe, expect, test } from "vitest";
import {
  BodyShopCatalogueSession,
  bodyShopBodyIds,
  fujiBodyShopStock,
  peachBodyShopStock,
  reconstructedBodyShopStock,
} from "./bodyCatalog";

describe("original Body Shop stock", () => {
  test("keeps reward-only Peach bodies out of the 20-body ordinary shop stock", () => {
    expect(peachBodyShopStock).toHaveLength(20);
    expect(peachBodyShopStock.map((item) => item.bodyId)).toEqual([
      1, 2, 7, 8, 9, 10, 13, 14, 15, 16, 38, 39, 47, 62, 111, 122, 128, 129, 133, 145,
    ]);
    expect(peachBodyShopStock.every((item) => item.priceCake === 500)).toBe(true);
    expect(peachBodyShopStock.some((item) => [31, 87, 150].includes(item.bodyId))).toBe(false);
  });

  test("keeps the 22 Fuji bodies and exposes only reconstructed city catalogues", () => {
    expect(fujiBodyShopStock).toHaveLength(22);
    expect(fujiBodyShopStock.map((item) => item.bodyId)).toEqual([
      5, 12, 28, 40, 41, 43, 51, 53, 58, 61, 67, 71, 72, 73, 100, 103, 110, 112, 124, 126, 144, 146,
    ]);
    expect(reconstructedBodyShopStock(1)).toBe(peachBodyShopStock);
    expect(reconstructedBodyShopStock(2)).toBe(fujiBodyShopStock);
    expect(reconstructedBodyShopStock(3)).toBeUndefined();
    expect(bodyShopBodyIds).toEqual([...new Set([...peachBodyShopStock, ...fujiBodyShopStock].map((item) => item.bodyId))].sort((a, b) => a - b));
  });

  test("wraps browsing and rejects invalid direct selection", () => {
    const session = new BodyShopCatalogueSession(peachBodyShopStock);
    session.moveItem(-1);
    expect(session.selectedItem.bodyId).toBe(145);
    session.moveItem(1);
    expect(session.selectedItem.bodyId).toBe(1);
    expect(() => session.selectItem(20)).toThrow(/outside/);
  });
});

