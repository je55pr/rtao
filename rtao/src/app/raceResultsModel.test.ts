import { describe, expect, test } from "vitest";
import { raceResultsView } from "./raceResultsModel";
import type { RaceCompletionResult } from "../game/raceProgress";

function completion(overrides: Partial<RaceCompletionResult> = {}): RaceCompletionResult {
  return {
    status: "completed",
    activityId: 0,
    prizeCake: 800,
    cakeBefore: 200,
    cakeAfter: 1000,
    previousBestFinishIndex: 0xff,
    bestFinishIndex: 0,
    licenseBefore: 0,
    licenseAfter: 0,
    promoted: false,
    ...overrides,
  };
}

describe("raceResultsView", () => {
  test("presents native zero-based player/team places and credited Cake without recalculating reward", () => {
    expect(raceResultsView({ raceName: "Peach Raceway", completion: completion(), nativeFinishIndices: [0, 3] })).toEqual({
      raceName: "Peach Raceway",
      finishers: [{ label: "Player", place: "1st" }, { label: "Teammate 1", place: "4th" }],
      prize: "+800 Cake",
      balance: "1,000 Cake total",
      bestResult: "New best · 1st",
      bestUpdated: true,
      promotion: "",
      promotionVisible: false,
    });
  });
  test("reports an evidence-backed licence promotion and unchanged best result", () => {
    expect(raceResultsView({
      raceName: "Peach Raceway",
      completion: completion({
        prizeCake: 500,
        cakeAfter: 1500,
        previousBestFinishIndex: 0,
        bestFinishIndex: 0,
        licenseBefore: 0,
        licenseAfter: 1,
        promoted: true,
      }),
      nativeFinishIndices: [1],
    })).toMatchObject({
      finishers: [{ label: "Player", place: "2nd" }],
      prize: "+500 Cake",
      bestResult: "Best result · 1st",
      bestUpdated: false,
      promotion: "Licence promoted · C → B",
      promotionVisible: true,
    });
  });

  test("rejects incomplete or non-completed result handoffs", () => {
    expect(() => raceResultsView({ raceName: "Peach Raceway", completion: completion(), nativeFinishIndices: [0xff] }))
      .toThrow(/completed zero-based/);
    expect(() => raceResultsView({
      raceName: "Peach Raceway",
      completion: completion({ status: "locked" }),
      nativeFinishIndices: [0],
    })).toThrow(/completed ordinary-race handoff/);
  });
});
