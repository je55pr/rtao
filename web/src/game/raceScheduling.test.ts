import { describe, expect, test } from "vitest";
import { advanceNativeRaceCountdown } from "./raceScheduling";
import { nativeRacePositions } from "./racePositions";
import type { NativeRacePositionCar } from "./racePositions";

describe("PAL race scheduling and live positions", () => {
  const base = { elapsedUpdates: 0, fadeUpdates: 64, sceneFlags: 0, updatesPerSecond: 50 as const, shortFinalPhase: false };
  test("preserves the PAL start milestones and ordered final UI cleanup", () => {
    expect(advanceNativeRaceCountdown({ ...base, elapsedUpdates: 49 }).soundCue).toBeNull();
    expect(advanceNativeRaceCountdown({ ...base, elapsedUpdates: 50 })).toMatchObject({ soundCue: 45, uiStateIndices: [3] });
    expect(advanceNativeRaceCountdown({ ...base, elapsedUpdates: 199 }).sceneFlags).toBe(0);
    expect(advanceNativeRaceCountdown({ ...base, elapsedUpdates: 200 })).toMatchObject({ sceneFlags: 4, uiStateIndices: [6], completed: false });
    expect(advanceNativeRaceCountdown({ ...base, elapsedUpdates: 250, sceneFlags: 4 })).toMatchObject({ sceneFlags: 0x104, audioTransition: true, uiStateIndices: [6], completed: false });
    expect(advanceNativeRaceCountdown({ ...base, elapsedUpdates: 300, sceneFlags: 0x104 })).toMatchObject({ sceneFlags: 0x114, uiStateIndices: [6, 0], completed: true });
  });
  test("hold resets elapsed time while the independent fade advances", () => {
    expect(advanceNativeRaceCountdown({ ...base, elapsedUpdates: 100, fadeUpdates: 0, sceneFlags: 0x14000 })).toMatchObject({
      elapsedUpdates: 0, fadeUpdates: 1, sceneFlags: 0x4000, fadeArgument: 0x80000000, uiStateIndices: [],
    });
    expect(advanceNativeRaceCountdown({ ...base, fadeUpdates: 63 })).toMatchObject({ fadeUpdates: 64, fadeArgument: 0x02000000 });
    expect(advanceNativeRaceCountdown(base).fadeArgument).toBeNull();
  });
  test("retains both native early-completion conditions and the 60-Hz branch", () => {
    expect(advanceNativeRaceCountdown({ ...base, elapsedUpdates: 249, shortFinalPhase: true }).completed).toBe(false);
    expect(advanceNativeRaceCountdown({ ...base, elapsedUpdates: 250, shortFinalPhase: true }).completed).toBe(true);
    expect(advanceNativeRaceCountdown({ ...base, elapsedUpdates: 251, sceneFlags: 0x8000 }).completed).toBe(true);
    expect(advanceNativeRaceCountdown({ ...base, elapsedUpdates: 60, updatesPerSecond: 60 }).soundCue).toBe(45);
    expect(advanceNativeRaceCountdown({ ...base, elapsedUpdates: 360, updatesPerSecond: 60 }).completed).toBe(true);
    // Equality is deliberate: the native scheduler is responsible for visiting the boundary.
    expect(advanceNativeRaceCountdown({ ...base, elapsedUpdates: 301 }).completed).toBe(false);
  });
  const car = (carIndex: number, overrides: Partial<NativeRacePositionCar> = {}): NativeRacePositionCar =>
    ({ carIndex, flags: 0x80, completedLaps: 1, finishGatePhase: 2, navigationOutput: 10, navigationDistance: 5, ...overrides });
  test("orders by effective lap, gate phase, navigation output, then smaller distance", () => {
    const cars = [car(0), car(1, { navigationDistance: 4 }), car(2, { navigationOutput: 11 }),
      car(3, { finishGatePhase: 3 }), car(4, { completedLaps: 2 }), car(5, { completedLaps: 2, finishGatePhase: 1 })];
    expect(nativeRacePositions(cars, 0).map(v => v.carIndex)).toEqual([4, 3, 2, 1, 0, 5]);
  });
  test("excludes finished/inactive cars and preserves native car-slot ties", () => {
    expect(nativeRacePositions([car(4), car(3, { flags: 0 }), car(2), car(1, { flags: 0x280 }), car(0)], 1)).toEqual([
      { carIndex: 0, positionIndex: 1 }, { carIndex: 2, positionIndex: 2 }, { carIndex: 4, positionIndex: 3 },
    ]);
  });
});
