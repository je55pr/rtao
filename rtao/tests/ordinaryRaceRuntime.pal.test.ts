import { closeSync, fstatSync, openSync, readFileSync, readSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { Iso9660Disc } from "../src/disc/iso9660";
import { RawMode2SectorSource } from "../src/disc/randomAccess";
import { compileFieldCollision } from "../src/formats/fieldCollision";
import { OrdinaryRaceCoordinator } from "../src/game/raceSession/ordinaryRaceCoordinator";
import { createOrdinaryRaceRuntime } from "../src/game/raceSession/ordinaryRaceRuntime";

const executablePath = process.env.RTA_PAL_EXECUTABLE;
const binPath = process.env.RTA_PAL_BIN;

describe.skipIf(!executablePath || !binPath)("PAL generic ordinary-race runtime", () => {
  test("runs Peach Raceway II activity 1 on COURSE/C00", async () => {
    const handle = openSync(binPath!, "r");
    try {
      const disc = await Iso9660Disc.open(new RawMode2SectorSource({
        size: fstatSync(handle).size,
        label: "local PAL BIN",
        async read(offset, length) {
          const bytes = new Uint8Array(length);
          if (readSync(handle, bytes, 0, length, offset) !== length) throw new Error("Short PAL BIN read.");
          return bytes;
        },
      }));
      const executable = new Uint8Array(readFileSync(executablePath!));
      const courseBytes = await disc.readFile("COURSE/C00.BIN");
      const runtime = createOrdinaryRaceRuntime({
        activityId: 1,
        executable,
        courseBytes,
        compiledCollision: compileFieldCollision(courseBytes),
        playerEquipmentSelectors: Array(15).fill(0),
        playerEquipmentFlags: 0,
        globalEquipmentFlags: 0,
        countdown: { elapsedUpdates: 0, fadeUpdates: 64, sceneFlags: 0, updatesPerSecond: 50 },
        sceneKind: 0,
        sceneByte0B: 0,
        raceModeByte: 0,
      });

      expect(runtime).toMatchObject({
        activityId: 1,
        activityName: "Peach Raceway II",
        courseId: 0,
      });
      expect(runtime.initialCommands).toHaveLength(24);
      expect(runtime.navigation?.courseId).toBe(0);
      expect(runtime.speedProfile).toHaveLength(256);

      const coordinator = new OrdinaryRaceCoordinator(runtime);
      const start = runtime.session.entrant(0).state.coordinates;
      const startX = start[0];
      const startZ = start[2];
      for (let update = 0; update < 420; update += 1) {
        coordinator.step({ sceneTime: update, playerCommands: 1 });
      }
      const end = runtime.session.entrant(0).state.coordinates;
      const movement = Math.hypot(end[0] - startX, end[2] - startZ);
      expect(movement).toBeGreaterThan(0.01);
      expect(Number.isFinite(end[1])).toBe(true);
    } finally {
      closeSync(handle);
    }
  }, 60_000);
});
