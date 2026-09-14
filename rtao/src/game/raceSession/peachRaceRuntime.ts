import {
  createOrdinaryRaceRuntime,
  type OrdinaryRaceRuntime,
  type OrdinaryRaceRuntimeInput,
  type OrdinaryRaceRuntimeSceneSeed,
} from "./ordinaryRaceRuntime";

export type PeachRaceRuntimeSceneSeed = OrdinaryRaceRuntimeSceneSeed;
export type PeachRaceRuntimeInput = Omit<OrdinaryRaceRuntimeInput, "activityId">;
export type PeachRaceRuntime = OrdinaryRaceRuntime;

/**
 * Compatibility wrapper for the first validated ordinary-race slice.
 * New game-facing launches should use createOrdinaryRaceRuntime directly.
 */
export function createPeachRaceRuntime(input: PeachRaceRuntimeInput): PeachRaceRuntime {
  const runtime = createOrdinaryRaceRuntime({ ...input, activityId: 0 });
  if (runtime.courseId !== 0) {
    throw new Error(`PAL Peach Raceway activity 0 unexpectedly maps to COURSE/C${runtime.courseId.toString().padStart(2, "0")}.`);
  }
  return runtime;
}