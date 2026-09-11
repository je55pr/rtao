import { placeOrdinal } from "./hudModel";
import { nativeUnfinishedRaceIndex, type RaceCompletionResult } from "../game/raceProgress";

export interface RaceResultFinisherView {
  readonly label: string;
  readonly place: string;
}

export interface RaceResultsView {
  readonly raceName: string;
  readonly finishers: readonly RaceResultFinisherView[];
  readonly prize: string;
  readonly balance: string;
  readonly bestResult: string;
  readonly bestUpdated: boolean;
  readonly promotion: string;
  readonly promotionVisible: boolean;
}

export interface RaceResultsViewInput {
  readonly raceName: string;
  readonly completion: RaceCompletionResult;
  /** Player first, followed by native teammate reward slots. */
  readonly nativeFinishIndices: readonly number[];
}

const licenceNames = ["C", "B", "A", "Super A"] as const;
export function raceResultsView(input: RaceResultsViewInput): RaceResultsView {
  if (input.completion.status !== "completed") {
    throw new Error("Race results UI requires a completed ordinary-race handoff.");
  }
  if (input.nativeFinishIndices.length < 1 || input.nativeFinishIndices.length > 3) {
    throw new RangeError("Race results UI requires the player and up to two teammate finish indices.");
  }
  if (input.nativeFinishIndices.some((value) => !Number.isInteger(value) || value < 0 || value >= nativeUnfinishedRaceIndex)) {
    throw new RangeError("Race results UI requires completed zero-based native finish indices.");
  }

  const bestUpdated = input.completion.bestFinishIndex < input.completion.previousBestFinishIndex;
  const bestPlace = placeOrdinal(input.completion.bestFinishIndex + 1);
  const promotionVisible = input.completion.promoted;
  return {
    raceName: input.raceName,
    finishers: input.nativeFinishIndices.map((finishIndex, index) => ({
      label: index === 0 ? "Player" : `Teammate ${index}`,
      place: placeOrdinal(finishIndex + 1),
    })),
    prize: `+${input.completion.prizeCake.toLocaleString("en-US")} Cake`,
    balance: `${input.completion.cakeAfter.toLocaleString("en-US")} Cake total`,
    bestResult: `${bestUpdated ? "New best" : "Best result"} · ${bestPlace}`,
    bestUpdated,
    promotion: promotionVisible
      ? `Licence promoted · ${licenceName(input.completion.licenseBefore)} → ${licenceName(input.completion.licenseAfter)}`
      : "",
    promotionVisible,
  };
}

function licenceName(value: number): string {
  return licenceNames[value] ?? `Class ${value}`;
}
