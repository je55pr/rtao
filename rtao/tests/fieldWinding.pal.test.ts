import { closeSync, fstatSync, openSync, readSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";
import { Iso9660Disc } from "../src/disc/iso9660";
import { RawMode2SectorSource } from "../src/disc/randomAccess";
import { fieldTriangleStripIndices, readFieldRenderPrimitives } from "../src/formats/fieldGeometry";

const binPath = process.env.RTA_PAL_BIN;
const outputPath = process.env.FIELD_WINDING_CENSUS_OUTPUT;

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

function census(bytes: Uint8Array) {
  let triangles = 0;
  let degenerate = 0;
  let horizontalPositive = 0;
  let horizontalNegative = 0;
  let primitives = 0;
  let billboards = 0;
  for (const primitive of readFieldRenderPrimitives(bytes)) {
    if ((primitive.gifTag.primitive & 7) !== 4) continue;
    primitives += 1;
    if (primitive.placementOffset) billboards += 1;
    for (let index = 0; index < primitive.vertices.length - 2; index += 1) {
      const indices = fieldTriangleStripIndices(index);
      const a = primitive.vertices[indices[0]]!.position;
      const b = primitive.vertices[indices[1]]!.position;
      const c = primitive.vertices[indices[2]]!.position;
      const ux = b.x - a.x, uy = b.y - a.y, uz = b.z - a.z;
      const vx = c.x - a.x, vy = c.y - a.y, vz = c.z - a.z;
      const nx = uy * vz - uz * vy;
      const ny = uz * vx - ux * vz;
      const nz = ux * vy - uy * vx;
      const magnitude = Math.hypot(nx, ny, nz);
      triangles += 1;
      if (magnitude < 1e-5) {
        degenerate += 1;
        continue;
      }
      if (Math.abs(ny) / magnitude >= 0.9) {
        if (ny >= 0) horizontalPositive += 1;
        else horizontalNegative += 1;
      }
    }
  }
  return { primitives, billboards, triangles, degenerate, horizontalPositive, horizontalNegative };
}
describe.skipIf(!binPath)("PAL FLD winding census", () => {
  test("locks source-strip winding facts across all 64 ordinary fields", async () => {
    const { disc, close } = await openDisc();
    try {
      const entries = (await disc.listDirectory("FLD"))
        .filter((entry) => !entry.directory && /^\d{3}\.BIN$/.test(entry.normalizedName))
        .sort((a, b) => a.normalizedName.localeCompare(b.normalizedName));
      expect(entries).toHaveLength(64);
      const fields: Record<string, ReturnType<typeof census>> = {};
      for (const entry of entries) {
        fields[entry.normalizedName.slice(0, 3)] = census(await disc.readFile(`FLD/${entry.normalizedName}`));
      }

      expect(fields["223"]).toEqual({
        primitives: 13917, billboards: 303, triangles: 29101, degenerate: 0,
        horizontalPositive: 15685, horizontalNegative: 503,
      });
      expect(fields["013"]).toEqual({
        primitives: 11121, billboards: 340, triangles: 34665, degenerate: 1,
        horizontalPositive: 10911, horizontalNegative: 1277,
      });
      expect(fields["223"]!.horizontalPositive).toBeGreaterThan(fields["223"]!.horizontalNegative * 20);
      expect(fields["013"]!.horizontalPositive).toBeGreaterThan(fields["013"]!.horizontalNegative * 8);

      if (outputPath) {
        writeFileSync(resolve(outputPath), `${JSON.stringify({
          schema: 1,
          coordinateSpace: "PAL source before browser X reflection",
          stripParity: "even 0,1,2; odd 2,1,3",
          fields,
        }, null, 2)}\n`);
      }
    } finally {
      close();
    }
  });
});
