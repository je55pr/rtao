import { describe, expect, test } from "vitest";
import {
  nativeFreeRoamSpecialAbilityFlags,
  nativeOptionConfigurationFlag,
  nativeOptionVariant,
  nativeOrdinaryRaceSpecialAbilityFlags,
  nativeSpecialAbilityExclusivityMasks,
  nativeSpecialAbilityFlags,
  nativeSpecialAbilitySystemBoundary,
  nativeSpecialEquipmentConfigurationFlags,
  nativeSpecialPartsConfigurationFlag,
} from "./nativeSpecialAbilityRuntime";

function selectors(...entries: readonly (readonly [number, number])[]): number[] {
  const result = Array<number>(15).fill(0);
  for (const [category, selector] of entries) result[category] = selector;
  return result;
}

describe("native special-ability runtime contract", () => {
  test("keeps the all-zero ordinary driving baseline free of special flags", () => {
    const baseline = selectors();
    expect(nativeSpecialEquipmentConfigurationFlags(baseline)).toBe(0);
    expect(nativeFreeRoamSpecialAbilityFlags(baseline)).toBe(0);
    expect(nativeOrdinaryRaceSpecialAbilityFlags(baseline)).toBe(0);
  });
  test("derives mutually-exclusive category 10 and 11 setup flags from selectors", () => {
    expect(nativeSpecialPartsConfigurationFlag(0)).toBe(0);
    expect(nativeSpecialPartsConfigurationFlag(1)).toBe(nativeSpecialAbilityFlags.propeller);
    expect(nativeSpecialPartsConfigurationFlag(2)).toBe(nativeSpecialAbilityFlags.jetTurbine);
    expect(nativeOptionConfigurationFlag(1)).toBe(nativeSpecialAbilityFlags.waterSki);
    expect(nativeOptionConfigurationFlag(2)).toBe(nativeSpecialAbilityFlags.flightWingFitted);
    expect(nativeOptionConfigurationFlag(3)).toBe(nativeSpecialAbilityFlags.policeLight);
    for (let selector = 4; selector <= 8; selector += 1) {
      expect(nativeOptionConfigurationFlag(selector)).toBe(nativeSpecialAbilityFlags.advertisingSign);
      expect(nativeOptionVariant(selector)).toBe(selector - 4);
    }
    expect(nativeSpecialAbilityExclusivityMasks()).toEqual({
      specialParts: nativeSpecialAbilityFlags.propeller | nativeSpecialAbilityFlags.jetTurbine,
      options: nativeSpecialAbilityFlags.flightWingFitted
        | nativeSpecialAbilityFlags.policeLight
        | nativeSpecialAbilityFlags.waterSki
        | nativeSpecialAbilityFlags.advertisingSign,
    });
  });

  test("routes only proven free-roam contact abilities into live driving", () => {
    const fitted = selectors([9, 1], [10, 1], [11, 1]);
    expect(nativeSpecialEquipmentConfigurationFlags(fitted)).toBe(
      nativeSpecialAbilityFlags.wingSet
      | nativeSpecialAbilityFlags.propeller
      | nativeSpecialAbilityFlags.waterSki,
    );
    expect(nativeFreeRoamSpecialAbilityFlags(fitted)).toBe(
      nativeSpecialAbilityFlags.propeller | nativeSpecialAbilityFlags.waterSki,
    );
  });

  test("routes the four recovered ordinary-race abilities while omitting presentation-only flags", () => {
    const fitted = selectors([8, 1], [9, 1], [10, 2], [11, 1], [12, 1], [13, 14], [14, 10]);
    expect(nativeOrdinaryRaceSpecialAbilityFlags(fitted)).toBe(
      nativeSpecialAbilityFlags.wingSet
      | nativeSpecialAbilityFlags.jetTurbine
      | nativeSpecialAbilityFlags.waterSki,
    );
    expect(nativeSpecialEquipmentConfigurationFlags(fitted)).toBe(
      nativeSpecialAbilityFlags.lights
      | nativeSpecialAbilityFlags.wingSet
      | nativeSpecialAbilityFlags.jetTurbine
      | nativeSpecialAbilityFlags.waterSki
      | nativeSpecialAbilityFlags.sticker,
    );
  });

  test("fails closed on Flight Wing and out-of-census selectors", () => {
    expect(() => nativeOrdinaryRaceSpecialAbilityFlags(selectors([11, 2]))).toThrow(/Flight Wing/);
    expect(() => nativeSpecialEquipmentConfigurationFlags(selectors([10, 3]))).toThrow(/Special Parts/);
    expect(() => nativeSpecialEquipmentConfigurationFlags(Array(14).fill(0))).toThrow(/15 categories/);
  });
  test("keeps unresolved system boundaries explicit rather than manufacturing consumers", () => {
    expect(nativeSpecialAbilitySystemBoundary.camera).toBe("no proven special-equipment camera consumer");
    expect(nativeSpecialAbilitySystemBoundary.audio).toMatch(/horn selector consumer unresolved/);
    expect(nativeSpecialAbilitySystemBoundary.visual).toMatch(/presentation unresolved/);
    expect(nativeSpecialAbilitySystemBoundary.persistence).toMatch(/persisted selector blocks/);
  });
});
