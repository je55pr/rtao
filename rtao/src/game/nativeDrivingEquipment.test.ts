import { describe, expect, test } from "vitest";
import { applyNativeDrivingEquipment } from "./nativeDrivingEquipment";

function target(values: number[]) {
  return {
    setNativeTyreSelector: (value: number) => { values[1] = value; },
    setNativeEngineSelector: (value: number) => { values[2] = value; },
    setNativeChassisSelector: (value: number) => { values[3] = value; },
    setNativeTransmissionSelector: (value: number) => { values[4] = value; },
    setNativeSteeringSelector: (value: number) => { values[5] = value; },
    setNativeBrakeSelector: (value: number) => { values[6] = value; },
  };
}

describe("native driving equipment bridge", () => {
  test("preserves selector-zero baseline when no recovered equipment state exists", () => {
    const applied: number[] = [];
    applyNativeDrivingEquipment(target(applied), undefined);
    expect(applied.slice(1, 7)).toEqual([0, 0, 0, 0, 0, 0]);
  });
  test("passes recovered categories 1..6 without browser tuning", () => {
    const applied: number[] = [];
    const selectors = [0, 11, 5, 4, 3, 2, 1];
    applyNativeDrivingEquipment(target(applied), {
      selectedItem: (_loadout, category) => selectors[category] ?? 0,
    });
    expect(applied.slice(1, 7)).toEqual(selectors.slice(1, 7));
  });
});
