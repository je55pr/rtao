import { expect, test } from "vitest";
import type { OutdoorResidentDefinition } from "../formats/overworld";
import { allWorldFieldNumbers } from "./worldTopology";
import { DrivingWorld, flatFieldCollision } from "./worldCollision";
import { ResidentMover } from "./worldSimulation";

test("resident simulation follows the executable route deterministically", () => {
  const world = new DrivingWorld();
  for (const field of allWorldFieldNumbers()) world.addCompiledField(field, flatFieldCollision(3));
  const definition: OutdoorResidentDefinition = {
    areaIndex: 1, fieldNumber: 223, localIndex: 1, name: "Test", bodyId: 62,
    paint: { primary: { r: 100, g: 100, b: 100 }, secondary: { r: 80, g: 80, b: 80 } },
    spawn: { x: 600, y: 3, z: 500, rawOrientation: 0 },
    route: [{ x: 600, z: 500 }, { x: 600, z: 600 }, { x: 500, z: 600 }],
  };
  const resident = new ResidentMover(definition, world);
  for (let frame = 0; frame < 60; frame += 1) resident.update(1 / 60);
  expect(resident.state.position.z).toBeGreaterThan(505);
  expect(resident.state.wheelSpin).not.toBe(0);
  expect(resident.state.nextRoutePoint).toBe(1);
});
