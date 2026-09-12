import { describe, expect, test } from "vitest";
import { ContactEdgeTracker, orientedBoundsOverlapXZ } from "./interactionContact";

const carBounds = {
  minimum: [-1, -0.5, -2],
  maximum: [1, 1, 2],
} as const;

describe("interaction contact", () => {
  test("detects oriented car-body contact without a proximity halo", () => {
    const player = { position: { x: 0, z: 0 }, yaw: 0, bounds: carBounds };
    const touching = { position: { x: 0, z: 3.9 }, yaw: 0, bounds: carBounds };
    const separated = { position: { x: 0, z: 4.1 }, yaw: 0, bounds: carBounds };
    expect(orientedBoundsOverlapXZ(player, touching)).toBe(true);
    expect(orientedBoundsOverlapXZ(player, separated)).toBe(false);
  });

  test("handles rotated resident bodies", () => {
    const player = { position: { x: 0, z: 0 }, yaw: 0, bounds: carBounds };
    const crossing = { position: { x: 2.8, z: 0 }, yaw: Math.PI / 2, bounds: carBounds };
    const clear = { position: { x: 3.2, z: 0 }, yaw: Math.PI / 2, bounds: carBounds };
    expect(orientedBoundsOverlapXZ(player, crossing)).toBe(true);
    expect(orientedBoundsOverlapXZ(player, clear)).toBe(false);
  });

  test("auto-activation fires only on a new contact edge", () => {
    const tracker = new ContactEdgeTracker();
    expect(tracker.update(["npc:james"])).toEqual(["npc:james"]);
    expect(tracker.update(["npc:james"])).toEqual([]);
    expect(tracker.update([])).toEqual([]);
    expect(tracker.update(["npc:james"])).toEqual(["npc:james"]);
  });

  test("tracks simultaneous contacts independently", () => {
    const tracker = new ContactEdgeTracker();
    expect(tracker.update(["door:1:0", "npc:james"])).toEqual(["door:1:0", "npc:james"]);
    expect(tracker.update(["door:1:0", "npc:james"])).toEqual([]);
    expect(tracker.update(["door:1:0"])).toEqual([]);
    expect(tracker.update(["door:1:0", "npc:james"])).toEqual(["npc:james"]);
  });
});
