import { expect, test } from "vitest";
import type { OutdoorResidentDefinition } from "../formats/overworld";
import { allWorldFieldNumbers } from "./worldTopology";
import { DrivingWorld, flatFieldCollision } from "./worldCollision";
import { BrowserWorldSimulation, ResidentMover } from "./worldSimulation";

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

test("resident simulation can add newly loaded field definitions without duplicating existing residents", () => {
  const world = new DrivingWorld();
  for (const field of allWorldFieldNumbers()) world.addCompiledField(field, flatFieldCollision(3));
  const definition: OutdoorResidentDefinition = {
    areaIndex: 1, fieldNumber: 223, localIndex: 1, name: "Peach", bodyId: 62,
    paint: { primary: { r: 100, g: 100, b: 100 }, secondary: { r: 80, g: 80, b: 80 } },
    spawn: { x: 600, y: 3, z: 500, rawOrientation: 0 },
    route: [],
  };
  const simulation = new BrowserWorldSimulation([definition], world, undefined as never);
  const neighbour = { ...definition, areaIndex: 2, fieldNumber: 222, localIndex: 0, name: "Neighbour" };
  expect(simulation.addDefinitions([definition, neighbour])).toBe(1);
  expect(simulation.residents.map((resident) => resident.state.definition.name)).toEqual(["Peach", "Neighbour"]);
});
