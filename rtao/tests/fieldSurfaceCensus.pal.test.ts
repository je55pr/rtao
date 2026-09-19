import { createHash } from "node:crypto";
import { closeSync, fstatSync, openSync, readFileSync, readSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { Iso9660Disc } from "../src/disc/iso9660";
import { RawMode2SectorSource } from "../src/disc/randomAccess";
import { compileFieldCollision, type CompiledFieldCollision } from "../src/formats/fieldCollision";

const binPath = process.env.RTA_PAL_BIN;
const outputPath = process.env.FIELD_SURFACE_CENSUS_OUTPUT;

const surfaceNames = ["Dry", "Off-road", "Wet", "Grass", "Snow", "Ice"] as const;
const committedEvidencePath = fileURLToPath(new URL(
  "../../docs/evidence/surfaces/field-surface-census-2026-09-20.json",
  import.meta.url,
));

interface SurfaceWitness {
  readonly selector: number;
  readonly count: number;
  readonly surfaceWord: string;
  readonly centroid: readonly [number, number, number];
}

interface SourceSummary {
  readonly id: string;
  readonly path: string;
  readonly triangleCount: number;
  readonly selectors: readonly SurfaceWitness[];
}

async function openDisc(): Promise<{ disc: Iso9660Disc; close: () => void }> {
  if (!binPath) throw new Error("RTA_PAL_BIN is required for the PAL surface census.");
  const handle = openSync(binPath, "r");
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

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function round(value: number, places = 6): number {
  const scale = 10 ** places;
  return Math.round(value * scale) / scale;
}

function reflectedCentroid(collision: CompiledFieldCollision, triangleIndex: number): readonly [number, number, number] {
  const offset = triangleIndex * 9;
  const p = collision.positions;
  return [
    round(((p[offset] ?? 0) + (p[offset + 3] ?? 0) + (p[offset + 6] ?? 0)) / 3),
    round(((p[offset + 1] ?? 0) + (p[offset + 4] ?? 0) + (p[offset + 7] ?? 0)) / 3),
    round(((p[offset + 2] ?? 0) + (p[offset + 5] ?? 0) + (p[offset + 8] ?? 0)) / 3),
  ];
}

function hexWord(value: number): string {
  return `0x${(value >>> 0).toString(16).padStart(8, "0")}`;
}

function summarizeCollision(id: string, path: string, collision: CompiledFieldCollision): SourceSummary {
  const counts = new Map<number, number>();
  const first = new Map<number, number>();
  for (let index = 0; index < collision.triangleCount; index += 1) {
    const selector = (collision.surfaceFlags[index] ?? 0) & 0xf;
    counts.set(selector, (counts.get(selector) ?? 0) + 1);
    if (!first.has(selector)) first.set(selector, index);
  }
  const selectors = [...counts].sort((a, b) => a[0] - b[0]).map(([selector, count]) => {
    const triangleIndex = first.get(selector);
    if (triangleIndex === undefined) throw new Error(`Missing witness for selector ${selector}.`);
    return {
      selector,
      count,
      surfaceWord: hexWord(collision.surfaceFlags[triangleIndex] ?? 0),
      centroid: reflectedCentroid(collision, triangleIndex),
    };
  });
  return { id, path, triangleCount: collision.triangleCount, selectors };
}

function aggregate(sources: readonly SourceSummary[]) {
  const populations = Array.from({ length: 16 }, () => 0);
  const occurrences = Array.from({ length: 16 }, () => [] as string[]);
  for (const source of sources) {
    for (const entry of source.selectors) {
      populations[entry.selector] = (populations[entry.selector] ?? 0) + entry.count;
      occurrences[entry.selector]?.push(source.id);
    }
  }
  return { populations, occurrences };
}

function witness(sources: readonly SourceSummary[], sourceId: string, selector: number): SurfaceWitness {
  const source = sources.find((entry) => entry.id === sourceId);
  const result = source?.selectors.find((entry) => entry.selector === selector);
  if (!result) throw new Error(`Missing ${sourceId} selector ${selector} witness.`);
  return result;
}

describe.skipIf(!binPath)("PAL field collision surface census", () => {
  test("locks all 64 FLD fields plus Cloud Hill ACTION/A16 without retaining payloads", async () => {
    const { disc, close } = await openDisc();
    try {
      const fieldEntries = (await disc.listDirectory("FLD"))
        .filter((entry) => !entry.directory && /^\d{3}\.BIN$/.test(entry.normalizedName))
        .sort((a, b) => a.normalizedName.localeCompare(b.normalizedName));
      expect(fieldEntries).toHaveLength(64);

      const sources: SourceSummary[] = [];
      for (const entry of fieldEntries) {
        const id = `FLD/${entry.normalizedName.slice(0, 3)}`;
        const path = `FLD/${entry.normalizedName}`;
        sources.push(summarizeCollision(id, path, compileFieldCollision(await disc.readFile(path))));
      }
      sources.push(summarizeCollision(
        "ACTION/A16",
        "ACTION/A16.BIN",
        compileFieldCollision(await disc.readFile("ACTION/A16.BIN")),
      ));

      const standard = aggregate(sources.slice(0, 64));
      const all = aggregate(sources);
      const report = {
        schema: 1,
        authority: {
          executable: "SLES_513.56",
          executableSha256: sha256(await disc.readFile("SLES_513.56")),
        },
        scope: {
          standardFieldCount: 64,
          specialOutdoorSources: ["ACTION/A16.BIN"],
          payloadRetained: false,
          selectorMeaning: surfaceNames,
          raceSlotsExcluded: [6, 7],
        },
        standard: { populations: standard.populations, occurrences: standard.occurrences },
        overworldAndSpecialOutdoor: { populations: all.populations, occurrences: all.occurrences },
        sources,
      };

      const expectedEvidence = JSON.parse(readFileSync(committedEvidencePath, "utf8")) as typeof report;
      expect(report.authority.executableSha256).toBe(
        "2b4a310fc8bb145ccbc5e5ec5d023f0c29903c3e4555d63983d4a976f689eff9",
      );
      expect(standard.populations).toEqual([
        65095, 675958, 0, 122861, 11169, 2957, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      ]);
      expect(all.populations).toEqual([
        67448, 675958, 0, 122861, 11169, 2957, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      ]);
      expect(standard.occurrences).toEqual(expectedEvidence.standard.occurrences);
      expect(all.occurrences).toEqual(expectedEvidence.overworldAndSpecialOutdoor.occurrences);
      expect(sources).toEqual(expectedEvidence.sources);

      // Slots 6/7 are separately recovered ordinary-race car-record grip slots.
      // These assertions only prove that field/special-outdoor collision words never select 6..15.
      expect(all.populations.slice(6)).toEqual(Array(10).fill(0));
      expect(all.occurrences.slice(6)).toEqual(Array.from({ length: 10 }, () => []));

      expect(witness(sources, "ACTION/A16", 0)).toEqual({
        selector: 0, count: 2353, surfaceWord: "0x00002550", centroid: [1466.666667, 50, 133.333333],
      });
      expect(witness(sources, "FLD/113", 0)).toEqual({
        selector: 0, count: 1986, surfaceWord: "0x10000000", centroid: [1333.333333, 0, 66.666667],
      });
      expect(witness(sources, "FLD/000", 1)).toEqual({
        selector: 1, count: 13327, surfaceWord: "0x80100651", centroid: [1542.606283, -35.025472, 81.601379],
      });
      expect(witness(sources, "FLD/203", 3)).toEqual({
        selector: 3, count: 4492, surfaceWord: "0x00000313", centroid: [1533.333333, 188.756582, 106.666667],
      });
      expect(witness(sources, "FLD/203", 4)).toEqual({
        selector: 4, count: 11169, surfaceWord: "0x00000444", centroid: [1129.941935, 234, 206.001343],
      });
      expect(witness(sources, "FLD/203", 5)).toEqual({
        selector: 5, count: 738, surfaceWord: "0x00000455", centroid: [873.333333, 231.979996, 293.333333],
      });

      if (outputPath) {
        const destination = resolve(outputPath);
        writeFileSync(destination, `${JSON.stringify(report, null, 2)}\n`);
        console.log(`field-surface census: ${destination}`);
      }
    } finally {
      close();
    }
  });
});
