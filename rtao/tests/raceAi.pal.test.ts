import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { describe, expect, test } from "vitest";
import { readRaceCatalogue, readRaceNavigationCourses } from "../src/formats/raceCatalogue";
import { nativeRaceAiCommands, nativeRaceTargetAngles, readOrdinaryRaceSpeedProfiles } from "../src/game/raceAi";
import { PalScalarMachine } from "../test-support/palScalarMachine";

const executablePath = process.env.RTA_PAL_EXECUTABLE;

describe.skipIf(!executablePath)("actual PAL race AI instruction oracle", () => {
  test("matches native target angles, commands, yaw and both mutable profiles across seeded cases", () => {
    const executable = new Uint8Array(readFileSync(executablePath!));
    const machine = new PalScalarMachine(executable);
    const catalogue = readRaceCatalogue(executable);
    const courses = readRaceNavigationCourses(executable);
    const profiles = readOrdinaryRaceSpeedProfiles(executable);
    expect([...profiles[0]!.slice(0, 8)]).toEqual([13, 20, 13, 15, 20, 16, 16, 24]);
    const sceneAddress = 0x1000000, carAddress = 0x1001000;
    const targetsAddress = 0x1002000, feedbackAddress = 0x1002200, recordsAddress = 0x1003000, gateAddress = 0x1004000;
    let seed = 0x525441;
    const random = (): number => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed; };
    const cases = 4096;
    let feedbackCases = 0;
    const commandCounts: Record<string, number> = {};
    const yawCorrections = { positive: 0, negative: 0 };
    for (let index = 0; index < cases; index++) {
      const activityId = index % 24;
      const activity = catalogue.ordinaryRaces[activityId]!;
      const course = courses[activity.sceneId]!;
      const gate = course.gates[random() % course.gates.length]!;
      const current = random() % course.records.length;
      const lookAhead = index % 5 === 0 ? current : random() % course.records.length;
      const car = {
        nativeX: Math.fround(gate.branchPoint.nativeX + ((random() % 10000) - 5000) / 100),
        nativeZ: Math.fround(gate.branchPoint.nativeZ + ((random() % 10000) - 5000) / 100),
        configPointerIndex: random() % 32,
        nativeYaw: random() & 65535,
        nativeSpeed: index % 11 === 0 ? random() | 0 : (random() % 120000) - 10000,
        steeringEnabled: (random() & 4) !== 0,
        speedLimit: index % 3 === 0 ? random() & 255 : 0,
      };
      const context = { sceneFlags: index % 3 === 0 ? 4 : 0, updateSpeedFeedback: index % 2 === 0 };
      if (context.updateSpeedFeedback) feedbackCases++;
      const speedTargets = profiles[activityId]!.slice();
      const speedFeedback = Uint8Array.from({ length: 256 }, () => random() & 255);
      if (index % 7 === 0) speedTargets[current] = random() & 255;
      machine.memory.fill(0, sceneAddress, sceneAddress + 0x80);
      machine.memory.fill(0, carAddress, carAddress + 0x270);
      machine.memory.set(speedTargets, targetsAddress); machine.memory.set(speedFeedback, feedbackAddress);
      const v = machine.view;
      v.setUint32(sceneAddress + 0x28, context.sceneFlags, true);
      v.setFloat32(carAddress + 0x90, car.nativeX, true); v.setFloat32(carAddress + 0x98, car.nativeZ, true);
      v.setUint32(carAddress + 0x194, car.configPointerIndex, true);
      v.setUint8(carAddress + 0x19a, car.steeringEnabled ? 1 : 0);
      v.setInt32(carAddress + 0x1b8, car.nativeSpeed, true); v.setUint16(carAddress + 0x1d4, car.nativeYaw, true);
      v.setUint8(carAddress + 0x246, car.speedLimit); v.setUint8(carAddress + 0x24a, current);
      v.setUint32(carAddress + 0x250, gateAddress, true); v.setUint32(carAddress + 0x254, recordsAddress, true);
      v.setUint32(carAddress + 0x258, targetsAddress, true); v.setUint32(carAddress + 0x25c, feedbackAddress, true);
      v.setUint8(recordsAddress + lookAhead * 8 + 1, 0);
      [gate.endpointA.nativeX, gate.endpointA.nativeZ, gate.endpointB.nativeX, gate.endpointB.nativeZ, gate.branchPoint.nativeX, gate.branchPoint.nativeZ]
        .forEach((value, i) => v.setFloat32(gateAddress + i * 4, value, true));
      const packedAngles = machine.run(0x252198, [gateAddress, carAddress + 0x90, car.configPointerIndex & 3]);
      const angles = nativeRaceTargetAngles(gate, car.nativeX, car.nativeZ, car.configPointerIndex);
      expect(angles, `PAL target case ${index}`).toEqual({ low: packedAngles & 65535, high: packedAngles >>> 16 });
      const commandMask = machine.run(0x252ba0, [sceneAddress, carAddress, lookAhead, context.updateSpeedFeedback ? 1 : 0]);
      const output = nativeRaceAiCommands(car, context, { speedTargets, speedFeedback }, current, lookAhead, angles);
      expect(output.commandMask, `PAL command case ${index}`).toBe(commandMask);
      expect(output.nativeYaw, `PAL yaw case ${index}`).toBe(v.getUint16(carAddress + 0x1d4, true));
      expect(speedTargets, `PAL targets case ${index}`).toEqual(machine.memory.slice(targetsAddress, targetsAddress + 256));
      expect(speedFeedback, `PAL feedback case ${index}`).toEqual(machine.memory.slice(feedbackAddress, feedbackAddress + 256));
      const key = `0x${commandMask.toString(16).padStart(4, "0")}`;
      commandCounts[key] = (commandCounts[key] ?? 0) + 1;
      if (output.nativeYaw === ((car.nativeYaw + 256) & 65535)) yawCorrections.positive++;
      if (output.nativeYaw === ((car.nativeYaw - 256) & 65535)) yawCorrections.negative++;
    }
    const report = { authority: "SLES_513.56", executableSha256: createHash("sha256").update(executable).digest("hex"),
      cases, activityCount: 24, courseCount: 15, feedbackCases, commandCounts, yawCorrections,
      verified: ["target angle halfwords", "command mask", "native yaw", "all 256 speed targets", "all 256 feedback bytes"],
      oracle: "Original PAL scalar instructions; host float32 COP1 model, not a cycle-accurate R5900 emulator" };
    if (process.env.RTA_RACE_AI_REPORT) writeFileSync(process.env.RTA_RACE_AI_REPORT, JSON.stringify(report, null, 2) + "\n");
  }, 60_000);
});
