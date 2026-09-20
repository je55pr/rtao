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
      // Preserve PAL physical steering commands; browser handedness is handled
      // only when native motion is projected into reflected render coordinates.
      const commands = 1 | (steering < 0 ? 0x8000 : steering > 0 ? 0x2000 : 0);
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
        "symmetric",
      );
      raceVehicle = race.state;
      raceVelocity = race.worldVelocity;

      const freeRoam = motion.step({
        throttle: 1,
        steering,
        surfaceIndex: 0,
        contact: {
          driveContact: true,
          accelerationY: 89,
          allowsYaw: true,
          specialState: 0,
          propellerEnabled: false,
        },
      });

      expect(freeRoam.commands).toBe(commands);
      expect(freeRoam.nativeVehicle).toEqual(raceVehicle);
      expect(freeRoam.nativeVelocity).toEqual(raceVelocity);
      expect(nativeDrivingFixedStepSeconds).toBe(1 / 50);
    }
  });

  test("free-roam and race retain identical native controller inputs before presentation", () => {
    let free = createNativeChaseCameraState(0);
    let race = createNativeChaseCameraState(0);
    const samples = [
      { nativeSlip: 0 },
      { nativeSlip: -120 },
      { nativeSlip: 80 },
    ];
    for (const sample of samples) {
      free = advanceNativeChaseCamera(free, sample);
      race = advanceNativeChaseCamera(race, sample);
      expect(race).toEqual(free);
    }
  });
});
