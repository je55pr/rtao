import { readFileSync, writeFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { advanceNativeRaceCountdown, readInitialNativeRaceUpdateRate } from "../src/game/raceScheduling";
import { nativeRacePositions } from "../src/game/racePositions";
import { PalScalarMachine } from "../test-support/palScalarMachine";

const executablePath = process.env.RTA_PAL_EXECUTABLE;
describe.skipIf(!executablePath)("actual PAL countdown and live-order oracle", () => {
  test("matches countdown writes and ordered host requests across both native timing branches", () => {
    const bytes = new Uint8Array(readFileSync(executablePath!));
    expect(readInitialNativeRaceUpdateRate(bytes)).toBe(50);
    const machine = new PalScalarMachine(bytes), v = machine.view;
    const task = 0x1000000, scene = 0x1001000, parent = 0x1002000, ui = 0x1003000;
    let cases = 0;
    for (const rate of [50, 60] as const) for (const flags of [0, 4, 0x104, 0x14000, 0x8000]) {
      for (const tick of [0, 1, 49, 50, 59, 60, 63, 64, 199, 200, 239, 240, 249, 250, 251, 299, 300, 301, 359, 360, 361]) {
        for (const fade of [0, 63, 64]) for (const shortFinalPhase of [false, true]) {
          const input = { elapsedUpdates: tick, fadeUpdates: fade, sceneFlags: flags, updatesPerSecond: rate, shortFinalPhase };
          v.setInt16(task + 2, fade, true); v.setInt32(task + 8, tick, true);
          v.setUint32(task + 0x18, parent, true); v.setUint32(task + 0x1c, ui, true);
          v.setUint32(scene + 0x28, flags, true); v.setInt32(parent + 4, 0, true); v.setUint8(parent + 0x24, 0);
          v.setUint32(0x3d5f88, rate === 50 ? 1 : 0, true); v.setUint8(0x182060a, shortFinalPhase ? 1 : 0);
          const uiStateIndices: number[] = [];
          let fadeArgument: number | null = null, soundCue: number | null = null, audioTransition = false, completed = false;
          machine.run(0x22f068, [task, scene], {
            [0x2087b0]: args => { fadeArgument = args[0]!; return 0; },
            [0x25b2c8]: args => { soundCue = args[0]!; return 0; },
            [0x25b3a8]: () => { audioTransition = true; return 0; },
            [0x2340c0]: args => { uiStateIndices.push(args[1]!); return 0; },
            [0x205128]: () => { completed = true; return 0; },
          });
          expect(advanceNativeRaceCountdown(input), `PAL countdown ${JSON.stringify(input)}`).toEqual({
            elapsedUpdates: v.getInt32(task + 8, true), fadeUpdates: v.getInt16(task + 2, true),
            sceneFlags: v.getUint32(scene + 0x28, true), fadeArgument, soundCue, audioTransition, uiStateIndices, completed,
          });
          if (completed) { expect(v.getUint8(parent + 0x24)).toBe(1); expect(v.getInt32(parent + 4, true)).toBe(-1); }
          cases++;
        }
      }
    }
    if (process.env.RTA_RACE_SCHEDULING_REPORT) writeFileSync(process.env.RTA_RACE_SCHEDULING_REPORT,
      JSON.stringify({ authority: "SLES_513.56", countdownCases: cases, rates: [50, 60],
        rankingCases: 256, limitation: "Native scalar callback logic; audio/fade/UI/scheduler callees are observed hooks, not emulated subsystems." }, null, 2) + "\n");
  });

  test("matches the native insertion ordering, finished-car exclusion and slot-stable ties", () => {
    const machine = new PalScalarMachine(new Uint8Array(readFileSync(executablePath!))), v = machine.view;
    let seed = 0x706f736e;
    const random = (): number => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed; };
    for (let iteration = 0; iteration < 256; iteration++) {
      const cars = Array.from({ length: 24 }, (_, carIndex) => ({ carIndex,
        flags: [0, 0x80, 0x90, 0x280][random() >>> 30]!,
        completedLaps: random() % 4, finishGatePhase: random() % 5,
        navigationOutput: random() % 35, navigationDistance: Math.fround((random() % 100) / 10),
      }));
      if (iteration % 2 === 0) cars.forEach(car => Object.assign(car, { completedLaps: 1, finishGatePhase: 2, navigationOutput: 10, navigationDistance: 3 }));
      const finishCount = cars.filter(car => (car.flags & 0x200) !== 0).length;
      for (const car of cars) {
        const address = 0x1820470 + car.carIndex * 0x270;
        v.setUint16(address + 0x198, car.flags, true); v.setUint8(address + 0x19b, car.completedLaps);
        v.setUint8(address + 0x19a, car.finishGatePhase); v.setUint8(address + 0x24b, car.navigationOutput);
        v.setFloat32(address + 0x24c, car.navigationDistance, true); v.setUint32(address + 0x264, 0, true);
        v.setUint8(address + 0x247, 255);
      }
      machine.run(0x22ed38, [finishCount]);
      const native = cars.filter(car => car.flags !== 0 && (car.flags & 0x200) === 0).map(car => ({
        carIndex: car.carIndex, positionIndex: v.getUint8(0x1820470 + car.carIndex * 0x270 + 0x247),
      })).sort((a, b) => a.positionIndex - b.positionIndex);
      expect(nativeRacePositions(cars, finishCount), `PAL ranking ${iteration}`).toEqual(native);
    }
  });
});
