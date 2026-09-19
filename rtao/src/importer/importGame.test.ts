import { describe, expect, test } from "vitest";
import type { DiscEntry } from "../disc/iso9660";
import type { OverworldCatalogue } from "../formats/overworld";
import { bodyShopBodyIds, peachBodyShopStock } from "../game/bodyCatalog";
import { browserBootstrapCarBodyIds, browserRuntimeCarBodyIds, selectRuntimeFiles } from "./importGame";

const nativeSfxPaths = [
  "SOUND/CQ_MAIN.TSQ", "SOUND/CQ_MAIN.TVB", "SOUND/ACTION.TSQ", "SOUND/ACTION.TVB",
] as const;
const nativeBgmPaths = [
  "SOUND/BGM.TVB",
  "SOUND/ROOM_1.TSQ",
  ...Array.from({ length: 12 }, (_, index) => `SOUND/BGM_${(index + 1).toString().padStart(2, "0")}.TSQ`),
] as const;
const nativeRadioPaths = [
  "SOUND/1CH_L.VAG", "SOUND/1CH_R.VAG", "SOUND/3CH_L.VAG", "SOUND/3CH_R.VAG",
] as const;

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

describe("import cache audio requirements", () => {
  test.each([
    ["SFX", nativeSfxPaths],
    ["BGM", nativeBgmPaths],
    ["radio", nativeRadioPaths],
  ] as const)("allows a valid PAL install to omit native %s assets", async (_label, missingPaths) => {
    const selected = await selectRuntimeFiles(fakeSelectionDisc(missingPaths) as never, "SLES_513.56", [], []);
    const selectedPaths = new Set(selected.map((entry) => entry.path.toUpperCase()));
    for (const path of missingPaths) expect(selectedPaths.has(path)).toBe(false);
    expect(selectedPaths.has("SYS/COIN.BIN")).toBe(true);
    expect(selectedPaths.has("SYS/SORA.GSL")).toBe(true);
  });

  test("still rejects a missing required non-audio PAL asset", async () => {
    await expect(
      selectRuntimeFiles(fakeSelectionDisc(["SYS/COIN.BIN"]) as never, "SLES_513.56", [], []),
    ).rejects.toThrow("Required game file 'SYS/COIN.BIN' is missing.");
  });
});

function fakeSelectionDisc(missingPaths: readonly string[] = []) {
  const missing = new Set(missingPaths.map((path) => path.toUpperCase()));
  const entry = (path: string): DiscEntry => {
    const normalizedPath = path.toUpperCase();
    const normalizedName = normalizedPath.split("/").at(-1)!;
    return { name: normalizedName, normalizedName, path: normalizedPath, extent: 0, size: 1, directory: false };
  };
  const fields = Array.from(
    { length: 64 },
    (_, index) => entry(`FLD/${index.toString().padStart(3, "0")}.BIN`),
  );
  return {
    fileExists: async (path: string) => !missing.has(path.toUpperCase()),
    stat: async (path: string) => entry(path),
    listDirectory: async (directory: string) => directory.toUpperCase() === "FLD" ? fields : [],
  };
}

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
