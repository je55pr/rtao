import { describe, expect, test } from "vitest";
import type { AuthoredAreaDescriptor } from "../formats/overworld";
import { classifyAreaTransitionOperands } from "./areaTransition";

const catalogue: readonly AuthoredAreaDescriptor[] = [
  syntheticArea(0, "My Garage", 65),
  syntheticArea(1, "Peach Town", 43, 223),
  syntheticArea(5, "Mushroom Road", 36, 210),
  syntheticArea(8, "Cloud Hill", 64),
  syntheticArea(9, "My City", 11, 23),
];

describe("dialogue action 0x14 transition intent", () => {
  test.each([
    [[1, 0], { kind: "standard-world", areaIndex: 1, name: "Peach Town", areaCode: 43, fieldNumber: 223, rawEntrySelector: 0 }],
    [[5, 0], { kind: "standard-world", areaIndex: 5, name: "Mushroom Road", areaCode: 36, fieldNumber: 210, rawEntrySelector: 0 }],
    [[8, 0], { kind: "special-outdoor", areaIndex: 8, name: "Cloud Hill", areaCode: 64, rawEntrySelector: 0 }],
    [[9, 20], { kind: "standard-world", areaIndex: 9, name: "My City", areaCode: 11, fieldNumber: 23, rawEntrySelector: 20 }],
    [[0, 0], { kind: "bootstrap-special", areaIndex: 0, name: "My Garage", areaCode: 65, rawEntrySelector: 0 }],
  ] as const)("classifies operands %j without interpreting entry selector", (operands, expected) => {
    expect(classifyAreaTransitionOperands(operands, catalogue)).toEqual(expected);
  });

  test("rejects malformed action payload widths", () => {
    expect(() => classifyAreaTransitionOperands([1], catalogue)).toThrow(/exactly two operands/);
    expect(() => classifyAreaTransitionOperands([1, 0, 4], catalogue)).toThrow(/exactly two operands/);
  });

  test("rejects destinations outside the executable-derived authored catalogue", () => {
    expect(() => classifyAreaTransitionOperands([22, 0], catalogue)).toThrow(/unknown authored area 22/);
  });
});

function syntheticArea(areaIndex: number, name: string, areaCode: number, fieldNumber?: number): AuthoredAreaDescriptor {
  return {
    areaIndex,
    name,
    areaCode,
    fixedInteractionCount: 0,
    outdoorResidentCount: 0,
    ...(fieldNumber === undefined ? {} : { fieldNumber }),
  };
}
