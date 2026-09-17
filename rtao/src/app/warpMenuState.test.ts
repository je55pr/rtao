import { describe, expect, test } from "vitest";
import type { AuthoredAreaDescriptor } from "../formats/overworld";
import {
  createWarpMenuState,
  moveWarpMenuSelection,
  selectedWarpMenuDestination,
} from "./warpMenuState";

const catalogue: readonly AuthoredAreaDescriptor[] = [
  area(0, "My Garage", 65),
  area(1, "Peach Town", 43, 223),
  area(2, "Fuji City", 22, 113),
  area(3, "City Three", 3, 3),
  area(4, "City Four", 4, 4),
  area(5, "Mushroom Road", 36, 210),
  area(6, "City Six", 6, 6),
  area(7, "City Seven", 7, 7),
  area(8, "Cloud Hill", 64),
  area(9, "My City", 11, 23),
];

describe("player Warp menu state", () => {
  test("shows only registered cities in native authored-area order with authored names", () => {
    const state = createWarpMenuState(registrations(9, 2, 5), catalogue);
    expect(state.destinations).toEqual([
      { areaIndex: 2, name: "Fuji City" },
      { areaIndex: 5, name: "Mushroom Road" },
      { areaIndex: 9, name: "My City" },
    ]);
    expect(state.selectedIndex).toBe(0);
  });

  test("does not invent destinations before their recovered registration exists", () => {
    expect(createWarpMenuState(registrations(), catalogue)).toEqual({ destinations: [], selectedIndex: -1 });
  });

  test("wraps native up/down selection deterministically", () => {
    const initial = createWarpMenuState(registrations(1, 2, 9), catalogue);
    const previous = moveWarpMenuSelection(initial, -1);
    expect(selectedWarpMenuDestination(previous)).toEqual({ areaIndex: 9, name: "My City" });
    const next = moveWarpMenuSelection(previous, 1);
    expect(selectedWarpMenuDestination(next)).toEqual({ areaIndex: 1, name: "Peach Town" });
  });
});

function registrations(...areaIndices: number[]) {
  const registered = new Set(areaIndices);
  return { hasWarpRegistration: (areaIndex: number) => registered.has(areaIndex) };
}

function area(areaIndex: number, name: string, areaCode: number, fieldNumber?: number): AuthoredAreaDescriptor {
  return {
    areaIndex,
    name,
    areaCode,
    fixedInteractionCount: areaIndex === 0 ? 0 : 1,
    outdoorResidentCount: 0,
    ...(fieldNumber === undefined ? {} : { fieldNumber }),
  };
}
