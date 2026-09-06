import { closeSync, fstatSync, openSync, readSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { Iso9660Disc } from "../src/disc/iso9660";
import { RawMode2SectorSource } from "../src/disc/randomAccess";
import { findTurbineAnchors, readFieldObjectAsset } from "../src/formats/fieldObjects";
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

  test("no other field carries a turbine-sized dynamic object", async () => {
    const { disc, close } = await openDisc();
    try {
      // The palm-crown fields (220/221) do carry an Extra[1] container, but its
      // meshes are ~10x smaller than the rotor, which is the render-side gate.
      for (const fieldNumber of [220, 221, 111, 112, 202, 203, 210, 211, 223, 233]) {
        const bytes = await disc.readFile(`FLD/${fieldNumber}.BIN`);
        const asset = readFieldObjectAsset(bytes);
        if (asset) expect(asset.radius, `FLD/${fieldNumber}`).toBeLessThan(20);
      }
    } finally {
      close();
    }
  });
});
