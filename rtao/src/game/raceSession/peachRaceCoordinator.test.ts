import { describe, expect, test } from "vitest";
import type { OrdinaryRaceSessionCarView } from "./raceSession";
import {
  peachRaceChaseCamera,
  peachRaceEntrantId,
  racePoseFromSessionCar,
} from "./peachRaceCoordinator";

describe("Peach race coordinator presentation bridge", () => {
  test("reflects native X and yaw into the established course render space", () => {
    const car = {
      state: {
        coordinates: [572.2, 1.1, 561.3, 1],
        vehicle: { yaw: 0x4000 },
      },
    } as unknown as OrdinaryRaceSessionCarView;
    const pose = racePoseFromSessionCar(car);
    expect(pose.position[0]).toBeCloseTo(1027.8);
    expect(pose.position.slice(1)).toEqual([1.1, 561.3]);
    expect(pose.yaw).toBeCloseTo(-Math.PI / 2);
  });

  test("derives a deterministic chase camera from the player pose", () => {
    const camera = peachRaceChaseCamera({ position: [100, 2, 200], yaw: 0 });
    expect(camera.position).toEqual([100, 6.8, 190]);
    expect(camera.target).toEqual([100, 3, 216]);
  });

  test("uses stable native car-slot presentation IDs", () => {
    expect(peachRaceEntrantId(0)).toBe("race-car-0");
    expect(peachRaceEntrantId(23)).toBe("race-car-23");
    expect(() => peachRaceEntrantId(24)).toThrow(/0\.\.23/);
  });
});
