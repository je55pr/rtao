import { describe, expect, test } from "vitest";
import {
  aggregatePartPerformance,
  applyKnownNativeEquipmentSelectors,
  createDevelopmentPartsSave,
  createPartLoadout,
  defaultPartLoadout,
  developmentPartCatalogue,
  equipPart,
  knownNativePart,
  knownNativePartCoordinate,
  nativeFittingCatalogue,
  partCategoryOrder,
  readDevelopmentPartsSave,
} from "./parts";

describe("development parts catalogue", () => {
  test("provides several immediately selectable parts in every original category", () => {
    expect(partCategoryOrder).toHaveLength(14);
    expect(partCategoryOrder.reduce((total, category) => total + developmentPartCatalogue[category].length, 0)).toBe(60);
    for (const category of partCategoryOrder) {
      expect(developmentPartCatalogue[category].length, category).toBeGreaterThanOrEqual(3);
      expect(developmentPartCatalogue[category][0]?.id).toBe(defaultPartLoadout[category]);
    }
  });

  test("equips one category without changing the others", () => {
    const upgraded = equipPart(defaultPartLoadout, "engine", "blue-max-engine");
    expect(upgraded.engine).toBe("blue-max-engine");
    expect(upgraded.tyres).toBe(defaultPartLoadout.tyres);
    expect(aggregatePartPerformance(upgraded).acceleration).toBeCloseTo(22 / 15);
  });

  test("applies the recovered chassis weight as an inverse-mass force response", () => {
    const light = aggregatePartPerformance(equipPart(defaultPartLoadout, "chassis", "light-chassis"));
    const phantom = aggregatePartPerformance(equipPart(defaultPartLoadout, "chassis", "phantom-chassis"));
    expect(light.acceleration).toBeCloseTo(25 / 22);
    expect(light.braking).toBeCloseTo(25 / 22);
    expect(light.steering).toBe(1);
    expect(phantom.acceleration).toBeCloseTo(25 / 18);
    expect(phantom.braking).toBeCloseTo(25 / 18);
  });

  test("uses native transmission launch and terminal gear ratios", () => {
    const sports = aggregatePartPerformance(equipPart(defaultPartLoadout, "transmission", "sports-transmission"));
    const power = aggregatePartPerformance(equipPart(defaultPartLoadout, "transmission", "power-transmission"));
    const speed = aggregatePartPerformance(equipPart(defaultPartLoadout, "transmission", "speed-transmission"));
    expect(sports.acceleration).toBe(1);
    expect(sports.topSpeed).toBeCloseTo(490 / 446);
    expect(power.acceleration).toBeCloseTo(116 / 128);
    expect(power.topSpeed).toBeCloseTo(557 / 446);
    expect(speed.acceleration).toBeCloseTo(116 / 128);
    expect(speed.topSpeed).toBeCloseTo(660 / 446);
  });

  test("repairs unknown or obsolete saved part identifiers", () => {
    const loadout = createPartLoadout({ engine: "removed-part", tyres: "off-road-tyre" });
    expect(loadout.engine).toBe(defaultPartLoadout.engine);
    expect(loadout.tyres).toBe("off-road-tyre");
    expect(readDevelopmentPartsSave(createDevelopmentPartsSave(loadout, "2026-08-23T00:00:00.000Z"))).toEqual(loadout);
    expect(readDevelopmentPartsSave({ schemaVersion: 99, loadout: {} })).toEqual(defaultPartLoadout);
  });


  test("builds an ownership-gated native Q's Factory catalogue", async () => {
    const { DialogueRuntimeState } = await import("../formats/dialogue");
    const { seedInitialEquipmentOwnership } = await import("./commerceProgress");
    const ownership = new DialogueRuntimeState();
    seedInitialEquipmentOwnership(ownership);
    const selectors = Array(15).fill(0);

    expect(knownNativePartCoordinate("mesh-wheel")).toEqual({ nativeCategory: 7, nativeItemIndex: 1 });
    let wheels = nativeFittingCatalogue(ownership, selectors).find((category) => category.category === "wheels");
    expect(wheels?.parts.map((part) => part.definition.id)).toEqual(["normal-wheel"]);

    ownership.setIndexedFlag(7, 1);
    wheels = nativeFittingCatalogue(ownership, selectors).find((category) => category.category === "wheels");
    expect(wheels?.parts.map((part) => [part.definition.id, part.ownedCount])).toEqual([
      ["normal-wheel", 2],
      ["mesh-wheel", 1],
    ]);

    // Native baseline selector zero remains available for categories whose
    // normal/none state is implicit rather than an inventory grant.
    expect(nativeFittingCatalogue(ownership, selectors).find((category) => category.category === "options")?.parts[0]?.definition.id).toBe("no-option");
  });
  test("maps executable-proven selectors without shifting sparse native indices", () => {
    expect(knownNativePart(1, 6)).toBeUndefined();
    expect(knownNativePart(1, 7)?.id).toBe("off-road-tyre");
    expect(knownNativePart(1, 11)?.id).toBe("big-tyre");
    expect(knownNativePart(1, 11)?.appearance?.wheelScale ?? 1).toBe(1);
    expect(knownNativePart(11, 4)?.name).toBe("Peach Town Sign");
    expect(knownNativePart(11, 8)?.id).toBe("papaya-sign");
    expect(knownNativePart(11, 9)).toBeUndefined();

    const selectors = Array(15).fill(0);
    selectors[11] = 4;
    const recovered = applyKnownNativeEquipmentSelectors(defaultPartLoadout, selectors);
    expect(recovered.options).toBe("billboard");
  });
});
