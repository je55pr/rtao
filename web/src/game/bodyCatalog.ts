export interface BodyShopStockItem {
  readonly bodyId: number;
  readonly name: string;
  readonly priceCake: 500;
}

/**
 * Ordinary Body Shop stock from the original location catalogue. Reward-only
 * bodies are intentionally excluded even when their reward is earned in the
 * same town. Transaction/ownership state remains a separate host concern.
 */
export const peachBodyShopStock: readonly BodyShopStockItem[] = Object.freeze([
  body(1, "Nissan Skyline R34 GT-R"),
  body(2, "Datsun Fairlady Z"),
  body(7, "Nissan Skyline R33 GT-R"),
  body(8, "Nissan Skyline R32 GT-R"),
  body(9, "'73 Nissan Skyline 2000 GT-R"),
  body(10, "Nissan Primera"),
  body(13, "Silvia S15"),
  body(14, "Nissan 300ZX"),
  body(15, "DR30 Skyline"),
  body(16, "Silvia S13"),
  body(38, "Nissan 240SX (older)"),
  body(39, "Nissan 240SX (newer)"),
  body(47, "'70 Nissan Skyline 2000 GT-R"),
  body(62, "Nissan Micra"),
  body(111, "Isuzu Bellett GTR"),
  body(122, "Mitsubishi CZ3 Tarmac"),
  body(128, "Nissan Stagea"),
  body(129, "Honda CRV"),
  body(133, "Nissan Primera"),
  body(145, "Mitsubishi Libero"),
]);

export const fujiBodyShopStock: readonly BodyShopStockItem[] = Object.freeze([
  body(5, "Toyota Supra (newer)"),
  body(12, "Lexus IS300"),
  body(28, "Toyota WiLL Vi"),
  body(40, "Toyota Sprinter Trueno AE85"),
  body(41, "Toyota Sprinter Trueno AE86"),
  body(43, "Toyota Caldina"),
  body(51, "'70 Toyota Celica"),
  body(53, "Toyota Vitz"),
  body(58, "Honda Accord"),
  body(61, "2000GT"),
  body(67, "Toyota Previa"),
  body(71, "Crown"),
  body(72, "Toyota Celica GT-Four (ST185)"),
  body(73, "Toyota bB"),
  body(100, "Toyota MR2 (newer)"),
  body(103, "Toyota Celica (older)"),
  body(110, "Toyota Celica GT (ST204)"),
  body(112, "Toyota MR2 (older)"),
  body(124, "Toyota Opa"),
  body(126, "Toyota Celsior"),
  body(144, "Toyota Raum"),
  body(146, "Toyota S800 Sport"),
]);

export const reconstructedBodyShopStocks: Readonly<Record<number, readonly BodyShopStockItem[]>> = Object.freeze({
  1: peachBodyShopStock,
  2: fujiBodyShopStock,
});

export const bodyShopBodyIds: readonly number[] = Object.freeze([
  ...new Set(Object.values(reconstructedBodyShopStocks).flatMap((stock) => stock.map((item) => item.bodyId))),
].sort((a, b) => a - b));

export function reconstructedBodyShopStock(areaIndex: number): readonly BodyShopStockItem[] | undefined {
  return reconstructedBodyShopStocks[areaIndex];
}

export class BodyShopCatalogueSession {
  itemIndex = 0;

  constructor(readonly stockItems: readonly BodyShopStockItem[]) {
    if (stockItems.length === 0) throw new Error("A Body Shop catalogue requires at least one stock item.");
  }

  get selectedItem(): BodyShopStockItem {
    return this.stockItems[this.itemIndex]!;
  }

  moveItem(delta: number): void {
    this.itemIndex = wrap(this.itemIndex + delta, this.stockItems.length);
  }

  selectItem(index: number): void {
    if (!Number.isInteger(index) || index < 0 || index >= this.stockItems.length) throw new RangeError(`Body ${index} is outside this shop's stock.`);
    this.itemIndex = index;
  }
}

function body(bodyId: number, name: string): BodyShopStockItem {
  return Object.freeze({ bodyId, name, priceCake: 500 });
}

function wrap(value: number, count: number): number {
  return ((value % count) + count) % count;
}

