import { describe, expect, test } from "vitest";
import {
  advanceNativeChaseCamera,
  createNativeChaseCameraState,
} from "./nativeChaseCamera";
import {
  NativeDrivingMotion,
  nativeDrivingFixedStepSeconds,
} from "./nativeDrivingMotion";
import { syntheticNativeDrivingMotionAuthority } from "./nativeDrivingMotion.testSupport";
import {
  inverseNativeRaceMatrix,
  nativeRaceYawMatrix,
  transformNativeRaceIntegerVector,
  type NativeRaceVector,
} from "./nativeRaceMath";
import {
  advanceNativeRaceVehicleVelocity,
  createNativeRaceVehicleState,
  nativeRaceDrag,
} from "./nativeRaceVehicle";

describe("native driving cross-mode integration", () => {
  test("free-roam wrapper retains the ordinary-race scalar vehicle core", () => {
    const authority = syntheticNativeDrivingMotionAuthority();
    const selectors = [0, 1, 2, 1, 1, 1, 1];
    const motion = new NativeDrivingMotion(authority, 0);
    for (let category = 1; category <= 6; category += 1) {
      motion.setSelector(category, selectors[category] ?? 0);
    }
    const equipment = authority.equipment(selectors);
    let raceVehicle = createNativeRaceVehicleState(0);
    let raceVelocity: NativeRaceVector = [0, 0, 0, 0];

    for (let tick = 0; tick < 120; tick += 1) {
      const steering = tick < 40 ? 0 : tick < 80 ? 1 : -1;
      const oldYaw = Math.fround(
        Math.fround((raceVehicle.yaw << 16 >> 16) * authority.yawScale) / 32768,
      );
      const matrix = nativeRaceYawMatrix(oldYaw, authority.math);
      const inverse = inverseNativeRaceMatrix(matrix);
      const localVelocity = transformNativeRaceIntegerVector(inverse, raceVelocity);
      const drag = nativeRaceDrag(localVelocity[2], localVelocity[0], equipment.mass, 0, 0, 0);
      // Browser semantic steering is reflected relative to PAL course yaw.
      const commands = 1 | (steering < 0 ? 0x2000 : steering > 0 ? 0x8000 : 0);
      const race = advanceNativeRaceVehicleVelocity(
        raceVehicle,
        equipment,
        {
          localForwardSpeed: drag.forward,
          localSideSpeed: drag.side,
          surfaceIndex: 0,
          driveContact: true,
          contactAccelerationY: 89,
          contactAllowsYaw: true,
        },
        commands,
        4,
        matrix,
        true,
      );
      raceVehicle = race.state;
      raceVelocity = race.worldVelocity;

      const freeRoam = motion.step({
        throttle: 1,
        steering,
        surfaceKind: "dry",
        contact: { driveContact: true, accelerationY: 89, allowsYaw: true },
      });

      expect(freeRoam.commands).toBe(commands);
      expect(freeRoam.nativeVehicle).toEqual(raceVehicle);
      expect(freeRoam.nativeVelocity).toEqual(raceVelocity);
      expect(nativeDrivingFixedStepSeconds).toBe(1 / 50);
    }
  });

  test("free-roam and reflected race presentation advance one chase-camera recurrence", () => {
    let free = createNativeChaseCameraState(0);
    let race = createNativeChaseCameraState(0);
    const samples = [
      { position: [600, 2, 300] as const, nativeYaw: 0x0000, nativeSlip: 0 },
      { position: [601, 2.2, 302] as const, nativeYaw: 0x1800, nativeSlip: -120 },
      { position: [603, 2.1, 305] as const, nativeYaw: 0x3000, nativeSlip: 80 },
    ];
    for (const sample of samples) {
      free = advanceNativeChaseCamera(free, sample);
      race = advanceNativeChaseCamera(
        race,
        {
          ...sample,
          position: [1600 - sample.position[0], sample.position[1], sample.position[2]],
        },
        { yawSign: -1 },
      );
      expect(race.position[0]).toBeCloseTo(1600 - free.position[0], 5);
      expect(race.position[1]).toBeCloseTo(free.position[1], 5);
      expect(race.position[2]).toBeCloseTo(free.position[2], 5);
      expect(race.target[0]).toBeCloseTo(1600 - free.target[0], 5);
      expect(race.target[1]).toBeCloseTo(free.target[1], 5);
      expect(race.target[2]).toBeCloseTo(free.target[2], 5);
      expect(race.slipInput).toBe(free.slipInput);
    }
  });
});
