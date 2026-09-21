import { describe, expect, test, vi } from "vitest";
import type { AuthoredAreaDescriptor, FixedInteractionDefinition } from "../formats/overworld";
import {
  resolveRegisteredWarpCityDestination,
  resolveWarpWorldEntry,
  runRegisteredCityWarp,
} from "./warpTravel";

const catalogue: readonly AuthoredAreaDescriptor[] = [
  area(0, "My Garage", 65),
  area(1, "Peach Town", 43, 223),
  area(2, "Fuji City", 22, 113),
  area(8, "Cloud Hill", 64),
  area(9, "My City", 11, 23),
];

describe("native Warp travel", () => {
  test("resolves a registered city through the authored area catalogue with selector zero", () => {
    const destination = resolveRegisteredWarpCityDestination(2, registrations(2), catalogue);
    expect(destination).toEqual({
      areaIndex: 2,
      name: "Fuji City",
      intent: {
        kind: "standard-world",
        areaIndex: 2,
        name: "Fuji City",
        areaCode: 22,
        fieldNumber: 113,
        rawEntrySelector: 0,
      },
    });
  });

  test("preserves Cloud Hill as the native special-outdoor selector-zero destination", () => {
    expect(resolveRegisteredWarpCityDestination(8, registrations(8), catalogue).intent).toEqual({
      kind: "special-outdoor",
      areaIndex: 8,
      name: "Cloud Hill",
      areaCode: 64,
      rawEntrySelector: 0,
    });
  });
  test("rejects unregistered and non-city destinations before entering anything", async () => {
    const enter = vi.fn();
    await expect(runRegisteredCityWarp(1, registrations(), catalogue, enter)).rejects.toThrow(/not registered/);
    await expect(runRegisteredCityWarp(0, registrations(0), catalogue, enter)).rejects.toThrow(/1 through 9/);
    expect(enter).not.toHaveBeenCalled();
  });

  test("runs the reusable transition operation only after registration resolves", async () => {
    const enter = vi.fn();
    const destination = await runRegisteredCityWarp(9, registrations(9), catalogue, enter);
    expect(destination.name).toBe("My City");
    expect(enter).toHaveBeenCalledOnce();
    expect(enter).toHaveBeenCalledWith(destination);
  });

  test("maps selector zero to the authored Q's Factory return edge, not the zone centroid", () => {
    const destination = resolveRegisteredWarpCityDestination(1, registrations(1), catalogue);
    const interaction = fixedInteraction(1, 223, 0, [[100, 200], [140, 200], [150, 260], [110, 260]]);
    const entry = resolveWarpWorldEntry(destination, [interaction]);
    expect(entry.interaction).toBe(interaction);
    expect(entry.position).toEqual({ x: 1470, y: -20, z: 260 });
    expect(entry.yaw).toBeCloseTo(Math.PI, 6);
  });

  test("rejects a standard city when its authored selector-zero Q's Factory entry is unavailable", () => {
    const destination = resolveRegisteredWarpCityDestination(1, registrations(1), catalogue);
    expect(() => resolveWarpWorldEntry(destination, [])).toThrow(/no authored fixed-interaction world entry/);
  });

  test("does not reinterpret a native special-outdoor Warp as a standard-world entry", () => {
    const destination = resolveRegisteredWarpCityDestination(8, registrations(8), catalogue);
    expect(() => resolveWarpWorldEntry(destination, [])).toThrow(/special-outdoor/);
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

function fixedInteraction(
  areaIndex: number,
  fieldNumber: number,
  localIndex: number,
  corners: ReadonlyArray<readonly [number, number]>,
): FixedInteractionDefinition {
  return {
    areaIndex,
    fieldNumber,
    localIndex,
    name: "Q's Factory Staff",
    bodyId: 0,
    paint: { primary: { r: 0, g: 0, b: 0 }, secondary: { r: 0, g: 0, b: 0 } },
    corners,
  };
}
