import { describe, expect, test } from "vitest";
import type { OverworldCatalogue } from "../formats/overworld";
import { bodyShopBodyIds, peachBodyShopStock } from "../game/bodyCatalog";
import { browserBootstrapCarBodyIds, browserRuntimeCarBodyIds } from "./importGame";

describe("browser runtime car selection", () => {
  test("keeps the player, residents, fixed-interaction staff, race participants, and Body Shop stock", () => {
    const catalogue: OverworldCatalogue = {
      residents: [
        resident(28, 1, 0),
        resident(75, 2, 0),
        resident(28, 3, 0),
      ],
      interactions: [
        interaction(44, 1, 0),
        interaction(149, 2, 5),
      ],
    };
    expect(browserRuntimeCarBodyIds(catalogue, [103, 28, 151])).toEqual(
      [...new Set([28, 44, 62, 75, 103, 149, 151, ...bodyShopBodyIds])].sort((a, b) => a - b),
    );
  });


  test("keeps the Peach bootstrap small while retaining Peach residents/interactions and Body Shop previews", () => {
    const catalogue: OverworldCatalogue = {
      residents: [resident(28, 1, 0), { ...resident(75, 2, 0), fieldNumber: 113 }],
      interactions: [interaction(44, 1, 0), { ...interaction(149, 2, 5), fieldNumber: 113 }],
    };
    expect(browserBootstrapCarBodyIds(catalogue)).toEqual(
      [...new Set([28, 44, 62, ...peachBodyShopStock.map((item) => item.bodyId)])].sort((a, b) => a - b),
    );
  });
});

function resident(bodyId: number, areaIndex: number, localIndex: number): OverworldCatalogue["residents"][number] {
  return {
    areaIndex,
    localIndex,
    fieldNumber: 223,
    name: `Resident ${bodyId}`,
    bodyId,
    paint: { primary: { r: 1, g: 2, b: 3 }, secondary: { r: 4, g: 5, b: 6 } },
    spawn: { x: 0, y: 0, z: 0, rawOrientation: 0 },
    route: [],
  };
}

function interaction(bodyId: number, areaIndex: number, localIndex: number): OverworldCatalogue["interactions"][number] {
  return {
    areaIndex,
    localIndex,
    fieldNumber: 223,
    name: `Interaction ${bodyId}`,
    bodyId,
    paint: { primary: { r: 1, g: 2, b: 3 }, secondary: { r: 4, g: 5, b: 6 } },
    corners: [],
  };
}
