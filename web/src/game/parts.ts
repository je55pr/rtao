import { nativeEngineAccelerationRatio, nativeSteeringRatio } from "./nativeEquipmentPerformance";
import { nativeChassisForceResponseRatio } from "./nativeChassisPerformance";
import { nativeTransmissionLaunchAccelerationRatio, nativeTransmissionTopSpeedRatio } from "./nativeTransmissionPerformance";

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
  part("engine", "panther-engine", "Panther", "PAL drive scalar 1800 versus Normal Engine's 1500.", { acceleration: nativeEngineAccelerationRatio(1) }),
  part("engine", "blue-max-engine", "Blue Max", "PAL drive scalar 2200 versus Normal Engine's 1500.", { acceleration: nativeEngineAccelerationRatio(2) }),
  part("engine", "mad-v2-engine", "Mad V2", "PAL drive scalar 3300 versus Normal Engine's 1500.", { acceleration: nativeEngineAccelerationRatio(5) }),

  part("chassis", "normal-chassis", "Normal Chassis", "PAL weight word 25."),
  part("chassis", "light-chassis", "Light Chassis", "PAL weight word 22 versus Normal Chassis' 25.", chassisPerformance(1)),
  part("chassis", "feather-chassis", "Feather Chassis", "PAL weight word 20 versus Normal Chassis' 25.", chassisPerformance(2)),
  part("chassis", "phantom-chassis", "Phantom Chassis", "PAL weight word 18 versus Normal Chassis' 25.", chassisPerformance(3)),

  part("transmission", "normal-transmission", "Normal Transmission", "PAL forward gears 116/162/227/318/446."),
  part("transmission", "sports-transmission", "Sports Transmission", "PAL launch gear 116; terminal gear 490 versus Normal's 446.", transmissionPerformance(1)),
  part("transmission", "power-transmission", "Power Transmission", "PAL launch gear 128; terminal gear 557 versus Normal's 446.", transmissionPerformance(2)),
  part("transmission", "speed-transmission", "Speed Transmission", "PAL launch gear 128; terminal gear 660 versus Normal's 446.", transmissionPerformance(3)),

  part("steering", "normal-steering", "Normal Steering", "The standard steering rack."),
  part("steering", "quick-steering", "Quick Steering", "PAL steering scalar 96 versus Normal Steering's 64.", { steering: nativeSteeringRatio(1) }),
  part("steering", "x2-quick-steering", "X2 Quick", "PAL steering scalar 128 versus Normal Steering's 64.", { steering: nativeSteeringRatio(2) }),
  part("steering", "x3-quick-steering", "X3 Quick", "PAL steering scalar 160 versus Normal Steering's 64.", { steering: nativeSteeringRatio(3) }),

  part("brakes", "normal-pad", "Normal Pad", "PAL 32-update brake curve: gradual force from 1 to 32."),
  part("brakes", "soft-pad", "Soft Pad", "PAL curve front-loads braking force; Good for quick braking."),
  part("brakes", "hard-pad", "Hard Pad", "PAL curve builds more gently; Helps for all around cornering."),
  part("brakes", "metal-pad", "Metal Pad", "PAL curve rises sharply through the middle of the hold; Stops on a dime."),

  part("wheels", "normal-wheel", "Normal Wheel", "The original wheel face.", undefined, { wheelStyle: "normal" }),
  part("wheels", "mesh-wheel", "Mesh Wheel", "The original PAL Mesh wheel geometry from WHEEL.BIN.", undefined, { wheelStyle: "mesh" }),
  part("wheels", "spoke-wheel", "Spoke 1", "The original PAL Spoke 1 wheel geometry sold in Peach Town.", undefined, { wheelStyle: "spoke" }),
  part("wheels", "dish-wheel", "Dish Wheel", "Solid retro development wheel caps.", undefined, { wheelStyle: "dish" }),

  part("lights", "normal-light", "Normal Light", "Standard warm headlights.", undefined, { lightColor: 0xffe3aa }),
  part("lights", "white-light", "White Light", "Clean white headlight lenses.", undefined, { lightColor: 0xf4fbff }),
  part("lights", "yellow-light", "Yellow Light", "Classic yellow headlight lenses.", undefined, { lightColor: 0xffd52c }),
  part("lights", "blue-light", "Blue Light", "Cool blue test headlight lenses.", undefined, { lightColor: 0x7fd8ff }),

  part("wing", "no-wing", "No Wing", "Keep the Q62's standard silhouette.", undefined, { wing: "none" }),
  part("wing", "wing-set-1", "Wing Set 1", "A low rear spoiler for visual testing.", undefined, { wing: "low" }),
  part("wing", "wing-set-2", "Wing Set 2", "A taller rear wing for visual testing.", undefined, { wing: "high" }),
  part("wing", "wing-set-3", "Wing Set 3", "A very wide experimental wing set.", undefined, { wing: "flight" }),

  part("special", "no-special", "No Special Part", "No special equipment fitted.", undefined, { special: "none" }),
  part("special", "propeller", "Propeller", "A playful rear propeller test attachment.", undefined, { special: "propeller" }),
  part("special", "jet-turbine", "Jet Turbine", "A compact turbine test attachment.", { acceleration: 1.05 }, { special: "turbine" }),

  part("options", "no-option", "No Option", "No optional roof equipment fitted.", undefined, { option: "none" }),
  part("options", "water-ski", "Water Ski", "The original water-driving option; propulsion remains unreconstructed."),
  part("options", "flight-wing", "Flight Wing", "The original flight option used with a jet turbine.", undefined, { wing: "flight" }),
  part("options", "police-light", "Police Light", "The original red and blue roof light bar.", undefined, { option: "police" }),
  part("options", "billboard", "Peach Town Sign", "The original café advertising sign fitted by Peach Town Owner.", undefined, { option: "billboard" }),
  part("options", "fuji-sign", "Fuji City Sign", "The original Fuji noodle-café advertising sign.", undefined, { option: "billboard" }),
  part("options", "sandpolis-sign", "Sandpolis Sign", "The original Sandpolis bakery advertising sign.", undefined, { option: "billboard" }),
  part("options", "white-mountain-sign", "White Mountain Sign", "The original wool-shop advertising sign.", undefined, { option: "billboard" }),
  part("options", "papaya-sign", "Papaya Island Sign", "The original coconut-shop advertising sign.", undefined, { option: "billboard" }),

  part("stickers", "no-sticker", "No Sticker", "Keep the body paint unmarked.", undefined, { sticker: "none" }),
  part("stickers", "stripe-sticker", "Racing Stripe", "A bright centre stripe represented by a temporary mesh.", undefined, { sticker: "stripe" }),
  part("stickers", "factory-sticker", "Q's Factory", "A green-and-orange factory badge test.", undefined, { sticker: "factory" }),
  part("stickers", "star-sticker", "Test Star", "A yellow development marker on the roof.", undefined, { sticker: "star" }),

  part("horns", "normal-horn", "Normal Horn", "The standard horn selection."),
  part("horns", "air-horn", "Air Horn", "The original Peach Town horn upgrade; audio switching remains deferred."),
  part("horns", "klaxon-horn", "Klaxon", "A placeholder klaxon selection for future audio work."),
  part("horns", "melody-horn", "Melody", "A placeholder musical horn selection for future audio work."),

  part("meters", "normal-meter", "Normal Meter", "The current driving readout."),
  part("meters", "sports-meter", "Sports Meter", "Reserved for a sport-styled HUD skin."),
  part("meters", "digital-meter", "Digital Meter", "Reserved for a digital HUD skin."),
  part("meters", "classic-meter", "Classic Meter", "Reserved for a classic HUD skin."),
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
  [7, 0, "normal-wheel"], [7, 1, "mesh-wheel"], [7, 2, "spoke-wheel"],
  [10, 0, "no-special"], [10, 1, "propeller"], [10, 2, "jet-turbine"],
  [11, 0, "no-option"], [11, 1, "water-ski"], [11, 2, "flight-wing"], [11, 3, "police-light"],
  [11, 4, "billboard"], [11, 5, "fuji-sign"], [11, 6, "sandpolis-sign"], [11, 7, "white-mountain-sign"], [11, 8, "papaya-sign"],
  [13, 0, "normal-horn"], [13, 1, "air-horn"], [14, 0, "normal-meter"], [14, 1, "digital-meter"],
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

function chassisPerformance(selector: number): Partial<PartPerformance> {
  const forceResponse = nativeChassisForceResponseRatio(selector);
  return { acceleration: forceResponse, braking: forceResponse };
}

function transmissionPerformance(selector: number): Partial<PartPerformance> {
  return {
    acceleration: nativeTransmissionLaunchAccelerationRatio(selector),
    topSpeed: nativeTransmissionTopSpeedRatio(selector),
  };
}
