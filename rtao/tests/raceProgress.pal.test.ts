import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { readRaceCatalogue } from "../src/formats/raceCatalogue";
import { PalScalarMachine } from "../test-support/palScalarMachine";

const executablePath = process.env.RTA_PAL_EXECUTABLE;

describe.skipIf(!executablePath)("actual PAL race progression oracle", () => {
  test("promotion uses stored top-six bests even after a worse replay result", () => {
    const bytes = new Uint8Array(readFileSync(executablePath!));
    const classCRaces = readRaceCatalogue(bytes).ordinaryRaces.filter((race) => race.variantId === 0);
    expect(classCRaces).toHaveLength(6);
    const currentActivityId = classCRaces.at(-1)!.activityId;
    const otherActivityId = classCRaces.find((race) => race.activityId !== currentActivityId)!.activityId;
    const machine = new PalScalarMachine(bytes);
    const v = machine.view;
    const result = 0x1000000;
    const raceContext = 0x1001000;
    const saveBase = 0x1824f80;
    const bestBase = saveBase + 0xff0;
    const nativePromotion = (latestFinishIndex: number, incompleteActivityId?: number): number => {
      machine.memory.fill(0, result, result + 0x100);
      machine.memory.fill(0, raceContext, raceContext + 0x100);
      for (let activityId = 0; activityId < 24; activityId++) v.setUint8(bestBase + activityId, 0xff);
      for (const race of classCRaces) v.setUint8(bestBase + race.activityId, 5);
      if (incompleteActivityId !== undefined) v.setUint8(bestBase + incompleteActivityId, 6);
      v.setInt8(saveBase + 0x651, 0);
      v.setUint8(0x182c82a, latestFinishIndex);
      v.setUint8(raceContext + 0x0a, 0);
      v.setUint8(raceContext + 0x20, currentActivityId);
      v.setUint32(raceContext + 0x10, 0, true);
      machine.run(0x238d00, [result, raceContext], {
        [0x20ebf8]: () => 0x1003000,
        [0x237048]: () => 0,
        [0x237a00]: () => 0,
        [0x237c78]: () => 0,
      });
      return v.getUint8(result + 0x27);
    };

    expect(nativePromotion(20)).toBe(1);
    expect(nativePromotion(20, otherActivityId)).toBe(0);
  });
});
