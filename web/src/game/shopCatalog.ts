export const shopPartCategoryOrder = [
  "tyres",
  "engine",
  "chassis",
  "transmission",
  "steering",
  "brakes",
  "wheels",
  "horns",
  "meters",
] as const;

export type ShopPartCategory = typeof shopPartCategoryOrder[number];

export interface ShopPartStockItem {
  readonly id: string;
  readonly category: ShopPartCategory;
  /** PAL executable ownership namespace passed to helpers 0x23f0a8/0x23ee20. */
  readonly nativeCategory: number;
  /** Zero-based index in the original category catalogue. */
  readonly nativeItemIndex: number;
  readonly name: string;
  readonly priceCake: number;
  readonly description: string;
}

export const shopPartCategoryLabels: Readonly<Record<ShopPartCategory, string>> = {
  tyres: "Tyre",
  engine: "Engine",
  chassis: "Chassis",
  transmission: "Transmission",
  steering: "Steering",
  brakes: "Brake",
  wheels: "Wheel",
  horns: "Horn",
  meters: "Meter",
};

/**
 * Original Peach Town stock confirmed by the PAL item catalogue and surviving
 * original-game references. Native category/item coordinates are the exact
 * inputs used by the executable's ownership helpers; transaction state remains
 * separate from static catalogue data.
 */
export const peachPartsShopStock: readonly ShopPartStockItem[] = Object.freeze([
  stock("tyres", 1, 1, "sports-tyre", "Sports Tyre", 1_000, "Road-focused tyres with higher grip."),
  stock("tyres", 1, 7, "off-road-tyre", "Off Road Tyre", 500, "Tyres intended for dirt and grass."),
  stock("engine", 2, 1, "panther-engine", "Panther", 500, "The first engine upgrade sold in Peach Town."),
  stock("steering", 5, 1, "quick-steering", "Quick", 500, "A quicker steering response."),
  stock("brakes", 6, 1, "soft-pad", "Soft Pad", 1_000, "The first brake upgrade."),
  stock("wheels", 7, 1, "mesh-wheel", "Mesh", 500, "Mesh-pattern wheel trim."),
  stock("wheels", 7, 2, "spoke-1-wheel", "Spoke 1", 500, "The first spoke-pattern wheel trim."),
  stock("horns", 13, 1, "air-horn", "Air Horn", 1_000, "A replacement horn sound."),
  stock("meters", 14, 1, "digital-meter", "Digital Meter", 100, "A digital dashboard meter."),
]);

/**
 * Evidence-backed subset of the native Second-hand shop catalogue. Normal
 * category 1..6 prices come from the PAL records and are present in a fresh
 * slot; the remaining entries reuse the exact Peach stock coordinates/prices.
 */
export const reconstructedSecondHandStock: readonly ShopPartStockItem[] = Object.freeze([
  stock("tyres", 1, 0, "normal-tyre", "Normal Tyre", 200, "The standard tyre set."),
  stock("engine", 2, 0, "normal-engine", "Normal Engine", 200, "The standard engine."),
  stock("chassis", 3, 0, "normal-chassis", "Normal Chassis", 200, "The standard 25-weight chassis."),
  stock("transmission", 4, 0, "normal-transmission", "Normal Transmission", 200, "The standard five-forward-gear transmission."),
  stock("steering", 5, 0, "normal-steering", "Normal Steering", 200, "The standard steering rack."),
  stock("brakes", 6, 0, "normal-pad", "Normal Pad", 500, "The standard brake pad."),
  ...peachPartsShopStock,
]);

export function reconstructedSecondHandInventory(ownership: { indexedFlagCount(namespace: number, index: number): number }): readonly ShopPartStockItem[] {
  return reconstructedSecondHandStock.filter((item) => ownership.indexedFlagCount(item.nativeCategory, item.nativeItemIndex) > 0);
}

export function reconstructedPartsShopStock(areaIndex: number): readonly ShopPartStockItem[] | undefined {
  return areaIndex === 1 ? peachPartsShopStock : undefined;
}

export class PartsShopCatalogueSession {
  readonly categories: readonly ShopPartCategory[];
  categoryIndex = 0;
  itemIndex = 0;

  constructor(readonly stockItems: readonly ShopPartStockItem[]) {
    this.categories = shopPartCategoryOrder.filter((category) => stockItems.some((item) => item.category === category));
    if (this.categories.length === 0) throw new Error("A parts-shop catalogue requires at least one stock item.");
  }

  get category(): ShopPartCategory {
    return this.categories[this.categoryIndex]!;
  }

  get items(): readonly ShopPartStockItem[] {
    return this.stockItems.filter((item) => item.category === this.category);
  }

  get selectedItem(): ShopPartStockItem {
    return this.items[this.itemIndex]!;
  }

  moveCategory(delta: number): void {
    this.categoryIndex = wrap(this.categoryIndex + delta, this.categories.length);
    this.itemIndex = 0;
  }

  selectCategory(category: ShopPartCategory): void {
    const index = this.categories.indexOf(category);
    if (index < 0) throw new Error(`The ${category} category has no stock in this shop.`);
    this.categoryIndex = index;
    this.itemIndex = 0;
  }

  moveItem(delta: number): void {
    this.itemIndex = wrap(this.itemIndex + delta, this.items.length);
  }

  selectItem(index: number): void {
    if (!Number.isInteger(index) || index < 0 || index >= this.items.length) throw new RangeError(`Stock item ${index} is outside this category.`);
    this.itemIndex = index;
  }
}

function stock(
  category: ShopPartCategory,
  nativeCategory: number,
  nativeItemIndex: number,
  id: string,
  name: string,
  priceCake: number,
  description: string,
): ShopPartStockItem {
  return Object.freeze({ category, nativeCategory, nativeItemIndex, id, name, priceCake, description });
}

function wrap(value: number, count: number): number {
  return ((value % count) + count) % count;
}
