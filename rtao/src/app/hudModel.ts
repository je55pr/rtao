/**
 * Decides what the game-facing HUD shows. Reconstruction diagnostics (sector,
 * triangle and resident counts, raw field ids, coordinates, surface) belong to
 * the developer overlay instead — see `debugDiagnostics`.
 */

export type GameHudMode = "overview" | "driving" | "race";

export interface GameHudState {
  readonly mode: GameHudMode;
  readonly cake: number;
  readonly location: string;
  readonly speedKph?: number;
  readonly raceStatus?: string;
  readonly nearby?: string;
}

export interface GameHudView {
  readonly visible: boolean;
  readonly location: string;
  readonly cake: string;
  readonly speed: string;
  readonly speedVisible: boolean;
  readonly status: string;
  readonly statusVisible: boolean;
  readonly hint: string;
}

const authoredFieldNames: Readonly<Record<number, string>> = {
  11: "FLD/011",
  12: "FLD/012",
  23: "FLD/023",
  113: "Fuji City",
  203: "White Mountain",
  213: "Mushroom Road",
  220: "Peach–Fuji bridge",
  223: "Peach Town",
  233: "Papaya Island",
};

/** Authored place name where one is known, otherwise the raw sector id. */
export function fieldDisplayName(fieldNumber: number): string {
  return authoredFieldNames[fieldNumber] ?? `FLD/${fieldNumber.toString().padStart(3, "0")}`;
}

export function gameHudView(state: GameHudState): GameHudView {
  const status = state.raceStatus ?? state.nearby ?? "";
  const speedVisible = state.mode === "driving" && state.speedKph !== undefined;
  return {
    visible: state.mode !== "overview",
    location: state.location,
    cake: `${state.cake.toLocaleString("en-US")} Cake`,
    speed: speedVisible ? `${state.speedKph} km/h` : "",
    speedVisible,
    status,
    statusVisible: status.length > 0,
    hint: state.mode === "race" ? "Esc · leave race" : "Esc · pause and settings",
  };
}

export interface RaceHudStatus {
  readonly raceReleased: boolean;
  readonly finishIndex: number | null;
  readonly completedLaps: number;
  readonly entrantCount: number;
  readonly requiredLaps: number;
  readonly rewardSaved: boolean;
  /**
   * Live native place. Undefined while the session cannot rank the field yet —
   * the HUD then shows the lap alone rather than inventing an order.
   */
  readonly positionIndex?: number;
}

const ordinalSuffixes = ["th", "st", "nd", "rd"] as const;

export function placeOrdinal(place: number): string {
  const teen = place % 100;
  const suffix = teen >= 11 && teen <= 13 ? "th" : ordinalSuffixes[place % 10] ?? "th";
  return `${place}${suffix}`;
}

export function raceStatusText(status: RaceHudStatus): string {
  if (!status.raceReleased) return "Starting grid";
  const place = status.finishIndex ?? status.positionIndex;
  const standing = place === undefined ? undefined : `${placeOrdinal(place + 1)} of ${status.entrantCount}`;
  if (status.finishIndex !== null) {
    return `Finished ${standing}${status.rewardSaved ? " · reward saved" : ""}`;
  }
  const lap = `Lap ${Math.min(status.requiredLaps, status.completedLaps + 1)}/${status.requiredLaps}`;
  return standing ? `${lap} · ${standing}` : lap;
}
