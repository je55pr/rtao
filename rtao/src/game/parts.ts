export const partCategoryOrder = [
  "tyres",
  "engine",
  "chassis",
  "transmission",
  "steering",
  "brakes",
  "wheels",
  "lights",
  "wing",
  "special",
  "options",
  "stickers",
  "horns",
  "meters",
] as const;

export type PartCategory = typeof partCategoryOrder[number];

export interface PartPerformance {
  readonly acceleration: number;
  readonly topSpeed: number;
  readonly steering: number;
  readonly braking: number;
  readonly pavedGrip: number;
  readonly offroadGrip: number;
}

export interface CarPartsAppearance {
  readonly wheelStyle: "normal" | "mesh" | "spoke" | "dish";
  /** Exact PAL WHEEL.BIN selector when the fitted native wheel identity is known. */
  readonly nativeWheelSelector: number;
  readonly wheelScale: number;
  readonly lightColor: number;
  readonly wing: "none" | "low" | "high" | "flight";
  readonly special: "none" | "propeller" | "turbine";
  readonly option: "none" | "police" | "billboard";
  readonly sticker: "none" | "stripe" | "factory" | "star";
}

export interface PartDefinition {
  readonly id: string;
  readonly category: PartCategory;
  readonly name: string;
  readonly description: string;
  /** Multipliers are temporary tuning values, not decoded game data. */
  readonly performance?: Partial<PartPerformance>;
  readonly appearance?: Partial<CarPartsAppearance>;
}

export type PartLoadout = Readonly<Record<PartCategory, string>>;

export interface DevelopmentPartsSave {
  readonly schemaVersion: 1;
  readonly savedAt: string;
  readonly loadout: PartLoadout;
}

export const partCategoryLabels: Readonly<Record<PartCategory, string>> = {
  tyres: "Tyres",
  engine: "Engine",
  chassis: "Chassis",
  transmission: "Transmission",
  steering: "Steering",
  brakes: "Brakes",
  wheels: "Wheels",
  lights: "Lights",
  wing: "Wing Set",
  special: "Special Parts",
  options: "Options",
  stickers: "Stickers",
  horns: "Horns",
  meters: "Meters",
};

const partDefinitions: readonly PartDefinition[] = [
  part("tyres", "normal-tyre", "Normal Tyre", "Balanced road tyres for everyday driving."),
  part("tyres", "sports-tyre", "Sports Tyre", "Native Sports tyre tuning: stronger dry and off-road grip than Normal; ordinary tyres share the same driving-render geometry."),
  part("tyres", "off-road-tyre", "Off Road Tyre", "Native Off Road tuning keeps Normal dry grip while improving the off-road coefficient; ordinary tyres share the same driving-render geometry."),
  part("tyres", "big-tyre", "Big Tyre", "Original oversized PAL Big Tyre geometry, raised chassis and recovered six-surface native grip profile."),

  part("engine", "normal-engine", "Normal Engine", "The standard Q62 engine."),
  part("engine", "panther-engine", "Panther", "PAL drive scalar 1800 versus Normal Engine's 1500."),
  part("engine", "blue-max-engine", "Blue Max", "PAL drive scalar 2200 versus Normal Engine's 1500."),
  part("engine", "mad-v2-engine", "Mad V2", "PAL drive scalar 3300 versus Normal Engine's 1500."),

  part("chassis", "normal-chassis", "Normal Chassis", "PAL weight word 25."),
  part("chassis", "light-chassis", "Light Chassis", "PAL weight word 22 versus Normal Chassis' 25."),
  part("chassis", "feather-chassis", "Feather Chassis", "PAL weight word 20 versus Normal Chassis' 25."),
  part("chassis", "phantom-chassis", "Phantom Chassis", "PAL weight word 18 versus Normal Chassis' 25."),

  part("transmission", "normal-transmission", "Normal Transmission", "PAL forward gears 116/162/227/318/446."),
  part("transmission", "sports-transmission", "Sports Transmission", "PAL launch gear 116; terminal gear 490 versus Normal's 446."),
  part("transmission", "power-transmission", "Power Transmission", "PAL launch gear 128; terminal gear 557 versus Normal's 446."),
  part("transmission", "speed-transmission", "Speed Transmission", "PAL launch gear 128; terminal gear 660 versus Normal's 446."),

  part("steering", "normal-steering", "Normal Steering", "The standard steering rack."),
  part("steering", "quick-steering", "Quick Steering", "PAL steering scalar 96 versus Normal Steering's 64."),
  part("steering", "x2-quick-steering", "X2 Quick", "PAL steering scalar 128 versus Normal Steering's 64."),
  part("steering", "x3-quick-steering", "X3 Quick", "PAL steering scalar 160 versus Normal Steering's 64."),

  part("brakes", "normal-pad", "Normal Pad", "PAL 32-update brake curve: gradual force from 1 to 32."),
  part("brakes", "soft-pad", "Soft Pad", "PAL curve front-loads braking force; Good for quick braking."),
  part("brakes", "hard-pad", "Hard Pad", "PAL curve builds more gently; Helps for all around cornering."),
  part("brakes", "metal-pad", "Metal Pad", "PAL curve rises sharply through the middle of the hold; Stops on a dime."),

  part("wheels", "normal-wheel", "Normal", "PAL WHEEL.BIN selector 0.", undefined, { nativeWheelSelector: 0 }),
  part("wheels", "mesh-wheel", "Mesh", "PAL WHEEL.BIN selector 1.", undefined, { nativeWheelSelector: 1 }),
  part("wheels", "spoke-1-wheel", "Spoke 1", "PAL WHEEL.BIN selector 2.", undefined, { nativeWheelSelector: 2 }),
  part("wheels", "spoke-2-wheel", "Spoke 2", "PAL WHEEL.BIN selector 3.", undefined, { nativeWheelSelector: 3 }),
  part("wheels", "flush-1-wheel", "Flush 1", "PAL WHEEL.BIN selector 4.", undefined, { nativeWheelSelector: 4 }),
  part("wheels", "spoke-3-wheel", "Spoke 3", "PAL WHEEL.BIN selector 5.", undefined, { nativeWheelSelector: 5 }),
  part("wheels", "flush-2-wheel", "Flush 2", "PAL WHEEL.BIN selector 6.", undefined, { nativeWheelSelector: 6 }),
  part("wheels", "spoke-4-wheel", "Spoke 4", "PAL WHEEL.BIN selector 7.", undefined, { nativeWheelSelector: 7 }),
  part("wheels", "spoke-5-wheel", "Spoke 5", "PAL WHEEL.BIN selector 8.", undefined, { nativeWheelSelector: 8 }),
  part("wheels", "spoke-6-wheel", "Spoke 6", "PAL WHEEL.BIN selector 9.", undefined, { nativeWheelSelector: 9 }),
  part("wheels", "flush-3-wheel", "Flush 3", "PAL WHEEL.BIN selector 10.", undefined, { nativeWheelSelector: 10 }),
  part("wheels", "flush-4-wheel", "Flush 4", "PAL WHEEL.BIN selector 11.", undefined, { nativeWheelSelector: 11 }),
  part("wheels", "flush-5-wheel", "Flush 5", "PAL WHEEL.BIN selector 12.", undefined, { nativeWheelSelector: 12 }),
  part("wheels", "spoke-7-wheel", "Spoke 7", "PAL WHEEL.BIN selector 13.", undefined, { nativeWheelSelector: 13 }),
  part("wheels", "spoke-666-wheel", "Spoke 666", "PAL WHEEL.BIN selector 14.", undefined, { nativeWheelSelector: 14 }),

  part("lights", "headlights", "Headlights", "Native selector 0; non-baseline light presentation remains unrecovered."),
  part("lights", "fog-lights", "Fog Lights", "Native selector 1; presentation remains evidence-gated."),
  part("lights", "beam-lights", "Beam Lights", "Native selector 2; presentation remains evidence-gated."),

  part("wing", "no-wing", "None", "Native selector 0."),
  part("wing", "wing-set", "Wing Set", "Native selector 1; ordinary-race control behavior is recovered, visual presentation remains gated."),

  part("special", "no-special", "None", "Native selector 0."),
  part("special", "propeller", "Propeller", "Native selector 1; special-contact thrust is recovered, accessory presentation remains gated."),
  part("special", "jet-turbine", "Jet Turbine", "Native selector 2; ordinary-race boost/fuel/audio behavior is recovered, accessory presentation remains gated."),

  part("options", "no-option", "None", "Native selector 0."),
  part("options", "water-ski", "Water Ski", "Native selector 1; restores steering authority while unsupported in auxiliary water contact and adds no propulsion."),
  part("options", "flight-wing", "Flight Wing", "Native selector 2; fitted/active contact and orientation behavior is recovered behind the exact PAL 0x0021E208 scalar gate, while presentation remains gated."),
  part("options", "police-light", "Police Light", "Native selector 3; presentation remains evidence-gated."),
  part("options", "billboard", "Peach Town Sign", "Native selector 4; sponsor progression is recovered, sign presentation remains gated."),
  part("options", "fuji-sign", "Fuji City Sign", "Native selector 5; sponsor progression is recovered, sign presentation remains gated."),
  part("options", "sandpolis-sign", "Sandpolis Sign", "Native selector 6; sponsor progression is recovered, sign presentation remains gated."),
  part("options", "white-mountain-sign", "White Mountain Sign", "Native selector 7; sponsor progression is recovered, sign presentation remains gated."),
  part("options", "papaya-sign", "Papaya Island Sign", "Native selector 8; sponsor progression is recovered, sign presentation remains gated."),

  part("stickers", "no-sticker", "None", "Native selector 0."),
  part("stickers", "sticker", "Sticker", "Native selector 1; renderer remains evidence-gated."),

  part("horns", "normal-horn", "Normal Horn", "Native selector 0; horn audio consumer remains evidence-gated."),
  part("horns", "air-horn", "Air Horn", "Native selector 1; horn audio consumer remains evidence-gated."),
  part("horns", "echo-air-horn", "Echo Air Horn", "Native selector 2; horn audio consumer remains evidence-gated."),
  part("horns", "bus-horn", "Bus Horn", "Native selector 3; horn audio consumer remains evidence-gated."),
  part("horns", "bicycle-bell", "Bicycle Bell", "Native selector 4; horn audio consumer remains evidence-gated."),
  part("horns", "venus-horn", "Venus Horn", "Native selector 5; horn audio consumer remains evidence-gated."),
  part("horns", "chicken-horn", "Chicken Horn", "Native selector 6; horn audio consumer remains evidence-gated."),
  part("horns", "fantasy-horn", "Fantasy Horn", "Native selector 7; horn audio consumer remains evidence-gated."),
  part("horns", "trumpet-horn", "Trumpet Horn", "Native selector 8; horn audio consumer remains evidence-gated."),
  part("horns", "christmas-horn", "Christmas Horn", "Native selector 9; horn audio consumer remains evidence-gated."),
  part("horns", "duck-horn", "Duck Horn", "Native selector 10; horn audio consumer remains evidence-gated."),
  part("horns", "space-horn", "Space Horn", "Native selector 11; horn audio consumer remains evidence-gated."),
  part("horns", "horse-horn", "Horse Horn", "Native selector 12; horn audio consumer remains evidence-gated."),
  part("horns", "baby-horn", "Baby Horn", "Native selector 13; horn audio consumer remains evidence-gated."),
  part("horns", "train-horn", "Train Horn", "Native selector 14; horn audio consumer remains evidence-gated."),

  part("meters", "normal-meter", "Normal Meter", "Native selector 0; HUD presentation remains evidence-gated."),
  part("meters", "chronometer", "Chronometer", "Native selector 1; HUD presentation remains evidence-gated."),
  part("meters", "rainbow-meter", "Rainbow Meter", "Native selector 2; HUD presentation remains evidence-gated."),
  part("meters", "space-meter", "Space Meter", "Native selector 3; HUD presentation remains evidence-gated."),
  part("meters", "triangle-meter", "Triangle Meter", "Native selector 4; HUD presentation remains evidence-gated."),
  part("meters", "love-sick-meter", "Love Sick Meter", "Native selector 5; HUD presentation remains evidence-gated."),
  part("meters", "life-meter", "Life Meter", "Native selector 6; HUD presentation remains evidence-gated."),
  part("meters", "cherry-meter", "Cherry Meter", "Native selector 7; HUD presentation remains evidence-gated."),
  part("meters", "duck-meter", "Duck Meter", "Native selector 8; HUD presentation remains evidence-gated."),
  part("meters", "devil-meter", "Devil Meter", "Native selector 9; HUD presentation remains evidence-gated."),
  part("meters", "digital-meter", "Digital Meter", "Native selector 10; HUD presentation remains evidence-gated."),
];

export const developmentPartCatalogue: Readonly<Record<PartCategory, readonly PartDefinition[]>> = Object.freeze(
  Object.fromEntries(partCategoryOrder.map((category) => [category, Object.freeze(partDefinitions.filter((definition) => definition.category === category))])) as Record<PartCategory, readonly PartDefinition[]>,
);

export const defaultPartLoadout: PartLoadout = Object.freeze(
  Object.fromEntries(partCategoryOrder.map((category) => [category, developmentPartCatalogue[category][0]?.id ?? ""])) as Record<PartCategory, string>,
);

export interface NativePartCoordinate {
  readonly nativeCategory: number;
  readonly nativeItemIndex: number;
}

export interface IndexedPartOwnershipState {
  indexedFlagCount(namespace: number, index: number): number;
}

export interface NativeFittingPart {
  readonly definition: PartDefinition;
  readonly nativeCategory: number;
  readonly nativeItemIndex: number;
  readonly ownedCount: number;
  readonly fitted: boolean;
}

export interface NativeFittingCategory {
  readonly category: PartCategory;
  readonly nativeCategory: number;
  readonly parts: readonly NativeFittingPart[];
}

/** Exact PAL category/item coordinates recovered from the native catalogues. */
const knownNativePartEntries = [
  [1, 0, "normal-tyre"], [1, 1, "sports-tyre"], [1, 7, "off-road-tyre"], [1, 11, "big-tyre"],
  [2, 0, "normal-engine"], [2, 1, "panther-engine"], [2, 2, "blue-max-engine"], [2, 5, "mad-v2-engine"],
  [3, 0, "normal-chassis"], [3, 1, "light-chassis"], [3, 2, "feather-chassis"], [3, 3, "phantom-chassis"],
  [4, 0, "normal-transmission"], [4, 1, "sports-transmission"], [4, 2, "power-transmission"], [4, 3, "speed-transmission"],
  [5, 0, "normal-steering"], [5, 1, "quick-steering"], [5, 2, "x2-quick-steering"], [5, 3, "x3-quick-steering"],
  [6, 0, "normal-pad"], [6, 1, "soft-pad"], [6, 2, "hard-pad"], [6, 3, "metal-pad"],
  [7, 0, "normal-wheel"], [7, 1, "mesh-wheel"], [7, 2, "spoke-1-wheel"], [7, 3, "spoke-2-wheel"],
  [7, 4, "flush-1-wheel"], [7, 5, "spoke-3-wheel"], [7, 6, "flush-2-wheel"], [7, 7, "spoke-4-wheel"],
  [7, 8, "spoke-5-wheel"], [7, 9, "spoke-6-wheel"], [7, 10, "flush-3-wheel"], [7, 11, "flush-4-wheel"],
  [7, 12, "flush-5-wheel"], [7, 13, "spoke-7-wheel"], [7, 14, "spoke-666-wheel"],
  [8, 0, "headlights"], [8, 1, "fog-lights"], [8, 2, "beam-lights"],
  [9, 0, "no-wing"], [9, 1, "wing-set"],
  [10, 0, "no-special"], [10, 1, "propeller"], [10, 2, "jet-turbine"],
  [11, 0, "no-option"], [11, 1, "water-ski"], [11, 2, "flight-wing"], [11, 3, "police-light"],
  [11, 4, "billboard"], [11, 5, "fuji-sign"], [11, 6, "sandpolis-sign"], [11, 7, "white-mountain-sign"], [11, 8, "papaya-sign"],
  [12, 0, "no-sticker"], [12, 1, "sticker"],
  [13, 0, "normal-horn"], [13, 1, "air-horn"], [13, 2, "echo-air-horn"], [13, 3, "bus-horn"],
  [13, 4, "bicycle-bell"], [13, 5, "venus-horn"], [13, 6, "chicken-horn"], [13, 7, "fantasy-horn"],
  [13, 8, "trumpet-horn"], [13, 9, "christmas-horn"], [13, 10, "duck-horn"], [13, 11, "space-horn"],
  [13, 12, "horse-horn"], [13, 13, "baby-horn"], [13, 14, "train-horn"],
  [14, 0, "normal-meter"], [14, 1, "chronometer"], [14, 2, "rainbow-meter"], [14, 3, "space-meter"],
  [14, 4, "triangle-meter"], [14, 5, "love-sick-meter"], [14, 6, "life-meter"], [14, 7, "cherry-meter"],
  [14, 8, "duck-meter"], [14, 9, "devil-meter"], [14, 10, "digital-meter"],
] as const;

const knownNativePartIds = new Map<string, string>(
  knownNativePartEntries.map(([category, item, id]) => [nativeKey(category, item), id]),
);
const knownNativeCoordinatesById = new Map<string, NativePartCoordinate>(
  knownNativePartEntries.map(([nativeCategory, nativeItemIndex, id]) => [id, Object.freeze({ nativeCategory, nativeItemIndex })]),
);

/** Returns only mappings established by executable catalogue records. */
export function knownNativePart(category: number, item: number): PartDefinition | undefined {
  const id = knownNativePartIds.get(nativeKey(category, item));
  if (!id) return undefined;
  for (const candidate of partDefinitions) if (candidate.id === id) return candidate;
  return undefined;
}

/** Reverse lookup for a development definition whose exact native selector is known. */
export function knownNativePartCoordinate(partOrId: PartDefinition | string): NativePartCoordinate | undefined {
  const id = typeof partOrId === "string" ? partOrId : partOrId.id;
  return knownNativeCoordinatesById.get(id);
}

/**
 * Q's Factory fitting catalogue restricted to executable-mapped items that are
 * owned in the selected save slot. The already-fitted selector is retained even
 * when its ownership count is zero so an old/native save can still display its
 * current configuration without granting a new fit.
 */
export function nativeFittingCatalogue(
  ownership: IndexedPartOwnershipState,
  selectors: readonly number[],
): readonly NativeFittingCategory[] {
  const categories: NativeFittingCategory[] = [];
  for (const category of partCategoryOrder) {
    const parts: NativeFittingPart[] = [];
    for (const definition of developmentPartCatalogue[category]) {
      const coordinate = knownNativePartCoordinate(definition);
      if (!coordinate) continue;
      const ownedCount = ownership.indexedFlagCount(coordinate.nativeCategory, coordinate.nativeItemIndex);
      const fitted = selectors[coordinate.nativeCategory] === coordinate.nativeItemIndex;
      // Selector zero is the native baseline/no-equipped choice and does not
      // require a purchased copy. Nonzero choices remain ownership-gated.
      if (coordinate.nativeItemIndex !== 0 && ownedCount <= 0 && !fitted) continue;
      parts.push(Object.freeze({ definition, ...coordinate, ownedCount, fitted }));
    }
    if (!parts.length) continue;
    categories.push(Object.freeze({ category, nativeCategory: parts[0]!.nativeCategory, parts: Object.freeze(parts) }));
  }
  return Object.freeze(categories);
}

/** Applies recoverable nonzero selectors while preserving the older development save elsewhere. */
export function applyKnownNativeEquipmentSelectors(loadout: PartLoadout, selectors: readonly number[]): PartLoadout {
  let result = loadout;
  for (let category = 1; category < selectors.length; category += 1) {
    const item = selectors[category] ?? 0;
    if (item === 0) continue;
    const definition = knownNativePart(category, item);
    if (definition) result = equipPart(result, definition.category, definition.id);
  }
  return result;
}

export const defaultPartsAppearance: CarPartsAppearance = Object.freeze({
  wheelStyle: "normal",
  nativeWheelSelector: 0,
  wheelScale: 1,
  lightColor: 0xffe3aa,
  wing: "none",
  special: "none",
  option: "none",
  sticker: "none",
});

export function createPartLoadout(source: unknown = defaultPartLoadout): PartLoadout {
  const input = source && typeof source === "object" ? source as Partial<Record<PartCategory, unknown>> : {};
  return Object.freeze(Object.fromEntries(partCategoryOrder.map((category) => {
    const candidate = input[category];
    const valid = typeof candidate === "string" && developmentPartCatalogue[category].some((partDefinition) => partDefinition.id === candidate);
    return [category, valid ? candidate : defaultPartLoadout[category]];
  })) as Record<PartCategory, string>);
}

export function equipPart(loadout: PartLoadout, category: PartCategory, partId: string): PartLoadout {
  if (!developmentPartCatalogue[category].some((partDefinition) => partDefinition.id === partId)) {
    throw new Error(`Part '${partId}' is not in the ${category} development catalogue.`);
  }
  return createPartLoadout({ ...loadout, [category]: partId });
}

export function selectedPart(loadout: PartLoadout, category: PartCategory): PartDefinition {
  return developmentPartCatalogue[category].find((partDefinition) => partDefinition.id === loadout[category])
    ?? developmentPartCatalogue[category][0]!;
}

export function aggregatePartPerformance(loadout: PartLoadout): PartPerformance {
  const result: Record<keyof PartPerformance, number> = {
    acceleration: 1,
    topSpeed: 1,
    steering: 1,
    braking: 1,
    pavedGrip: 1,
    offroadGrip: 1,
  };
  for (const category of partCategoryOrder) {
    const effects = selectedPart(loadout, category).performance;
    if (!effects) continue;
    for (const key of Object.keys(result) as Array<keyof PartPerformance>) result[key] *= effects[key] ?? 1;
  }
  return Object.freeze(result);
}

export function aggregatePartsAppearance(loadout: PartLoadout): CarPartsAppearance {
  const result = { ...defaultPartsAppearance };
  for (const category of partCategoryOrder) Object.assign(result, selectedPart(loadout, category).appearance);
  return Object.freeze(result);
}

export function createDevelopmentPartsSave(loadout: PartLoadout, savedAt = new Date().toISOString()): DevelopmentPartsSave {
  return { schemaVersion: 1, savedAt, loadout: createPartLoadout(loadout) };
}

export function readDevelopmentPartsSave(value: unknown): PartLoadout {
  if (!value || typeof value !== "object") return defaultPartLoadout;
  const record = value as Partial<DevelopmentPartsSave>;
  return record.schemaVersion === 1 ? createPartLoadout(record.loadout) : defaultPartLoadout;
}

function part(
  category: PartCategory,
  id: string,
  name: string,
  description: string,
  performance?: Partial<PartPerformance>,
  appearance?: Partial<CarPartsAppearance>,
): PartDefinition {
  return { category, id, name, description, performance, appearance };
}

function nativeKey(category: number, item: number): string {
  return `${category}:${item}`;
}
