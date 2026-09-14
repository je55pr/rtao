import { closeSync, fstatSync, openSync, readFileSync, readSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { Iso9660Disc } from "../src/disc/iso9660";
import { RawMode2SectorSource } from "../src/disc/randomAccess";
import { compileFieldCollision } from "../src/formats/fieldCollision";
import { readRaceCatalogue } from "../src/formats/raceCatalogue";
import { OrdinaryRaceCoordinator } from "../src/game/raceSession/ordinaryRaceCoordinator";
import { createOrdinaryRaceRuntime } from "../src/game/raceSession/ordinaryRaceRuntime";
import { ordinaryRaceOpponentEquipment } from "../src/game/nativeRaceVehicle";

const executablePath = process.env.RTA_PAL_EXECUTABLE;
const binPath = process.env.RTA_PAL_BIN;

describe.skipIf(!executablePath || !binPath)("PAL Temple Raceway browser runtime", () => {
  test("runs activity 2 with its original 0x3000 opponent equipment flags", async () => {
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
      }));
      const executable = new Uint8Array(readFileSync(executablePath!));
      const activity = readRaceCatalogue(executable).ordinaryRaces[2]!;
      expect(activity).toMatchObject({ activityId: 2, name: "Temple Raceway", sceneId: 1 });
      expect(ordinaryRaceOpponentEquipment(activity).equipmentFlags).toBe(0x3000);
      const courseBytes = await disc.readFile("COURSE/C01.BIN");
      const runtime = createOrdinaryRaceRuntime({
        activityId: 2, executable, courseBytes, compiledCollision: compileFieldCollision(courseBytes),
        playerEquipmentSelectors: Array<number>(15).fill(0), playerEquipmentFlags: 0, globalEquipmentFlags: 0,
        countdown: { elapsedUpdates: 0, fadeUpdates: 64, sceneFlags: 0, updatesPerSecond: 50 },
        sceneKind: 0, sceneByte0B: 0, raceModeByte: 0,
      });
      expect(runtime).toMatchObject({ activityId: 2, activityName: "Temple Raceway", courseId: 1 });
      expect(runtime.session.entrantCount).toBe(24);
      const coordinator = new OrdinaryRaceCoordinator(runtime);
      const initial = runtime.session.entrant(1).state.contact.position;
      for (let tick = 0; tick < 420; tick += 1) coordinator.step({ sceneTime: tick, playerCommands: 1 });
      const opponent = runtime.session.entrant(1);
      expect(opponent.state.contact.position).not.toEqual(initial);
      expect(opponent.state.distance).toBeGreaterThan(0);
      expect(runtime.session.isRaceReleased).toBe(true);
    } finally {
      closeSync(handle);
    }
  }, 120000);
});
