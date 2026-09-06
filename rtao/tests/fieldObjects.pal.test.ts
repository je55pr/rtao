import { closeSync, fstatSync, openSync, readSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { Iso9660Disc } from "../src/disc/iso9660";
import { RawMode2SectorSource } from "../src/disc/randomAccess";
import { findPalmCrownAnchors, findTurbineAnchors, readFieldObjectAsset } from "../src/formats/fieldObjects";
import { readFieldRenderPrimitives } from "../src/formats/fieldGeometry";

const binPath = process.env.RTA_PAL_BIN;

async function openDisc(): Promise<{ disc: Iso9660Disc; close: () => void }> {
  const handle = openSync(binPath!, "r");
  const disc = await Iso9660Disc.open(new RawMode2SectorSource({
    size: fstatSync(handle).size,
    label: "local PAL BIN",
    async read(offset, length) {
      const bytes = new Uint8Array(length);
      if (readSync(handle, bytes, 0, length, offset) !== length) throw new Error("Short PAL BIN read.");
      return bytes;
    },
  }));
  return { disc, close: () => closeSync(handle) };
}

describe.skipIf(!binPath)("FLD Extra[1] dynamic field objects", () => {
  test("FLD/213 Mushroom Road carries the wind-turbine rotor object", async () => {
    const { disc, close } = await openDisc();
    try {
      const bytes = await disc.readFile("FLD/213.BIN");
      const asset = readFieldObjectAsset(bytes);
      expect(asset).not.toBeNull();
      expect(asset!.meshes).toHaveLength(1);
      const triangleCount = asset!.meshes[0]!.positions.length / 9;
      expect(triangleCount).toBeGreaterThanOrEqual(24);
      expect(triangleCount).toBeLessThanOrEqual(48);
      // The rotor is the single large dynamic object across the PAL fields.
      expect(asset!.radius).toBeGreaterThan(35);
      expect(asset!.texture).not.toBeNull();
      expect(asset!.texture!.width).toBe(128);
      expect(asset!.texture!.height).toBe(128);

      const anchors = findTurbineAnchors(readFieldRenderPrimitives(bytes));
      expect(anchors.length).toBeGreaterThanOrEqual(18);
      expect(anchors.length).toBeLessThanOrEqual(26);
      for (const anchor of anchors) expect(anchor.y).toBeGreaterThan(100);
    } finally {
      close();
    }
  });

  test("FLD/220 and FLD/221 carry the coastal palm-crown object", async () => {
    const { disc, close } = await openDisc();
    try {
      for (const [fieldNumber, minCrowns] of [[220, 40], [221, 4]] as const) {
        const bytes = await disc.readFile(`FLD/${fieldNumber}.BIN`);
        const asset = readFieldObjectAsset(bytes);
        expect(asset?.kind, `FLD/${fieldNumber}`).toBe("palm-crown");
        expect(asset!.meshes).toHaveLength(3);
        expect(asset!.texture).not.toBeNull();

        const anchors = findPalmCrownAnchors(readFieldRenderPrimitives(bytes));
        expect(anchors.length, `FLD/${fieldNumber}`).toBeGreaterThanOrEqual(minCrowns);
        for (const anchor of anchors) expect(anchor.y).toBeLessThan(30);
      }
    } finally {
      close();
    }
  });

  test("Peach Town / Papaya Extra[1] props are not classified as crowns or rotors", async () => {
    const { disc, close } = await openDisc();
    try {
      for (const fieldNumber of [113, 202, 203, 210, 211, 223, 233]) {
        const bytes = await disc.readFile(`FLD/${fieldNumber}.BIN`);
        const asset = readFieldObjectAsset(bytes);
        if (asset) expect(asset.kind, `FLD/${fieldNumber}`).toBe("prop");
      }
    } finally {
      close();
    }
  });
});
