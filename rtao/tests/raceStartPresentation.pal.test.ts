import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { PalScalarMachine } from "../test-support/palScalarMachine";

const executablePath = process.env.RTA_PAL_EXECUTABLE;

const expectedPrimarySlots: Readonly<Record<number, readonly number[]>> = {
  1: [7, 7, 7, 7, 9, 9, 9, 9],
  2: [6, 6, 6, 6, 9, 9, 9, 9],
  3: [7, 6, 6, 6, 9, 9, 9, 9],
  4: [7, 7, 6, 6, 9, 9, 9, 9],
  5: [7, 7, 7, 6, 9, 9, 9, 9],
  6: [7, 7, 7, 7, 8, 8, 8, 8],
};

describe.skipIf(!executablePath)("actual PAL race-start UI host", () => {
  test("pins the eight primary widget slots for states 1..6", () => {
    const machine = new PalScalarMachine(new Uint8Array(readFileSync(executablePath!)));
    const ui = 0x1000000;
    for (let state = 1; state <= 6; state += 1) {
      machine.memory.fill(0, ui, ui + 0x9000);
      machine.run(0x2340c0, [ui, state], {
        0x281a58: (args) => {
          machine.memory.fill(args[1]! & 0xff, args[0]!, args[0]! + args[2]!);
          return args[0]!;
        },
      });
      const slots = Array.from({ length: 8 }, (_, index) =>
        machine.view.getUint32(ui + 0x8018 + index * 4, true));
      expect(slots, `PAL start-widget state ${state}`).toEqual(expectedPrimarySlots[state]);
    }
  });
});
