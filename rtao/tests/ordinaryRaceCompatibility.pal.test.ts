import { closeSync, fstatSync, openSync, readFileSync, readSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { Iso9660Disc } from "../src/disc/iso9660";
import { RawMode2SectorSource } from "../src/disc/randomAccess";
import { compileFieldCollision } from "../src/formats/fieldCollision";
import { readRaceCatalogue } from "../src/formats/raceCatalogue";
import { OrdinaryRaceCoordinator } from "../src/game/raceSession/ordinaryRaceCoordinator";
import { createOrdinaryRaceRuntime } from "../src/game/raceSession/ordinaryRaceRuntime";
import {
  browserSupportedOrdinaryRaceActivityIds,
  contactSurfaceBlockedOrdinaryRaceActivityIds,
} from "../src/game/raceSession/qFactoryRaceFlow";

const executablePath = process.env.RTA_PAL_EXECUTABLE;
const binPath = process.env.RTA_PAL_BIN;

describe.skipIf(!executablePath || !binPath)("PAL ordinary-race compatibility", () => {
  test("runs every browser-supported ordinary activity for 420 updates on original course data", async () => {
    const handle = openSync(binPath!, "r");
    try {
      const disc = await Iso9660Disc.open(new RawMode2SectorSource({
        size: fstatSync(handle).size,
        label: "local PAL BIN",
        async read(offset, length) {
          const bytes = new Uint8Array(length);
          if (readSync(handle, bytes, 0, length, offset) !== length) throw new Error("Short PAL BIN read");
          return bytes;
        },
      }));      const executable = new Uint8Array(readFileSync(executablePath!));
      const catalogue = readRaceCatalogue(executable);
      expect(catalogue.ordinaryRaces).toHaveLength(24);
      expect(contactSurfaceBlockedOrdinaryRaceActivityIds).toEqual([8, 14, 18, 19, 21]);

      const courses = new Map<number, { bytes: Uint8Array; collision: ReturnType<typeof compileFieldCollision> }>();
      for (const activityId of browserSupportedOrdinaryRaceActivityIds) {
        const activity = catalogue.ordinaryRaces[activityId]!;
        let course = courses.get(activity.sceneId);
        if (!course) {
          const bytes = await disc.readFile(`COURSE/C${String(activity.sceneId).padStart(2, "0")}.BIN`);
          course = { bytes, collision: compileFieldCollision(bytes) };
          courses.set(activity.sceneId, course);
        }
        const runtime = createOrdinaryRaceRuntime({
          activityId,
          executable,
          courseBytes: course.bytes,
          compiledCollision: course.collision,
          playerEquipmentSelectors: Array<number>(15).fill(0),
          playerEquipmentFlags: 0,
          globalEquipmentFlags: 0,
          countdown: { elapsedUpdates: 0, fadeUpdates: 64, sceneFlags: 0, updatesPerSecond: 50 },
          sceneKind: 0,
          sceneByte0B: 0,
          raceModeByte: 0,
        });
        expect(runtime.session.entrantCount, `activity ${activityId}`).toBe(24);        const coordinator = new OrdinaryRaceCoordinator(runtime);
        const initial = runtime.session.entrant(1).state.contact.position;
        for (let tick = 0; tick < 420; tick += 1) {
          coordinator.step({ sceneTime: tick, playerCommands: 1 });
        }
        const opponent = runtime.session.entrant(1);
        expect(runtime.session.isRaceReleased, `activity ${activityId}`).toBe(true);
        expect(opponent.state.contact.position, `activity ${activityId}`).not.toEqual(initial);
        expect(opponent.state.distance, `activity ${activityId}`).toBeGreaterThan(0);
      }
    } finally {
      closeSync(handle);
    }
  }, 120000);
});
