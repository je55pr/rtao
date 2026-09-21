import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { readFixedInteractionAtIndex } from "../src/formats/overworld";
import { fixedInteractionReturnPose } from "../src/game/fixedInteractionReturn";
import { PalScalarMachine } from "../test-support/palScalarMachine";

const executablePath = process.env.RTA_PAL_EXECUTABLE;

describe.skipIf(!executablePath)("PAL fixed-interaction exterior return", () => {
  const executable = (): Uint8Array => new Uint8Array(readFileSync(executablePath!));

  test.each([1, 2, 3, 4, 5, 6, 7, 8, 9])(
    "matches selector-zero PAL position and yaw for authored city area %i",
    (areaIndex) => {
      const bytes = executable();
      const machine = new PalScalarMachine(bytes);
      const control = 0x1000000;
      const car = 0x1001000;
      machine.view.setUint8(control + 0x21, 0);
      machine.view.setInt8(control + 0x23, areaIndex);
      machine.run(0x219160, [control, car], {}, { stopAt: 0x219294 });

      const interaction = readFixedInteractionAtIndex(bytes, areaIndex, 0);
      expect(interaction).toBeDefined();
      const pose = fixedInteractionReturnPose(interaction!);
      const nativeX = machine.view.getFloat32(car + 0x90, true);
      const nativeY = machine.view.getFloat32(car + 0x94, true);
      const nativeZ = machine.view.getFloat32(car + 0x98, true);
      const nativeYaw = machine.view.getInt16(car + 0x1d4, true);
      const yawScale = Math.fround(Math.PI);
      const browserYaw = -Math.fround(Math.fround(nativeYaw * yawScale) / Math.fround(32768));

      expect(pose.position.x, `area ${areaIndex} X`).toBeCloseTo(Math.fround(1600 - nativeX), 5);
      expect(pose.position.y, `area ${areaIndex} Y`).toBeCloseTo(nativeY, 5);
      expect(pose.position.z, `area ${areaIndex} Z`).toBeCloseTo(nativeZ, 5);
      expect(pose.yaw, `area ${areaIndex} yaw`).toBeCloseTo(browserYaw, 5);
    },
  );
});
