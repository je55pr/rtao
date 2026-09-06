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

      // Mushroom Road has exactly 22 turbine towers; lock the count so a
      // heuristic change that starts matching unrelated masts fails here.
      const anchors = findTurbineAnchors(readFieldRenderPrimitives(bytes));
      expect(anchors.length).toBe(22);
      for (const anchor of anchors) expect(anchor.y).toBeGreaterThan(100);
    } finally {
      close();
    }
  });

  test("FLD/220 and FLD/221 carry the coastal palm-crown object", async () => {
    const { disc, close } = await openDisc();
    try {
      // Exact counts, matching the C# reference's disc-backed regression
      // (FieldPalmTreeReader): 106 dominant trunk caps in FLD/220, 6 in FLD/221.
      // Locking them keeps the broader TS cap heuristic from silently spreading
      // crowns onto unrelated geometry.
      for (const [fieldNumber, expectedCrowns] of [[220, 106], [221, 6]] as const) {
        const bytes = await disc.readFile(`FLD/${String(fieldNumber).padStart(3, "0")}.BIN`);
        const asset = readFieldObjectAsset(bytes);
        expect(asset?.kind, `FLD/${fieldNumber}`).toBe("palm-crown");
        expect(asset!.meshes).toHaveLength(3);
        expect(asset!.texture).not.toBeNull();

        const anchors = findPalmCrownAnchors(readFieldRenderPrimitives(bytes));
        expect(anchors.length, `FLD/${fieldNumber}`).toBe(expectedCrowns);
        for (const anchor of anchors) expect(anchor.y).toBeLessThan(30);
      }
    } finally {
      close();
    }
  });

  test("other Extra[1] objects classify as props, not crowns or rotors", async () => {
    const { disc, close } = await openDisc();
    try {
      // 011 has a 180-unit flat mesh (radius > 20) but two sections, so it must
      // not be mistaken for the single-section rotor. 223 is the giant peach,
      // 233 the giant papaya, 113 a Fuji moat bridge, 202/203/211 ski markers.
      for (const fieldNumber of [11, 12, 113, 202, 203, 210, 211, 223, 233]) {
        const bytes = await disc.readFile(`FLD/${String(fieldNumber).padStart(3, "0")}.BIN`);
        const asset = readFieldObjectAsset(bytes);
        if (asset) expect(asset.kind, `FLD/${fieldNumber}`).toBe("prop");
      }
    } finally {
      close();
    }
  });
});
