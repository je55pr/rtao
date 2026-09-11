/**
 * Developer diagnostics relocated out of the game-facing HUD. These values are
 * reconstruction state, not recovered native behaviour, and stay hidden until a
 * developer opens the overlay.
 */

import type { DrivingSurfaceKind } from "../game/worldCollision";

export interface DiagnosticsRow {
  readonly label: string;
  readonly value: string;
}

export interface LiveDiagnostics {
  readonly mode: "overview" | "driving" | "race";
  readonly fps: number | undefined;
  readonly fieldNumber: number | undefined;
  readonly position: { readonly x: number; readonly y: number; readonly z: number } | undefined;
  readonly surface: DrivingSurfaceKind | undefined;
  readonly loadedSectors: number;
  readonly installStage: string | undefined;
}

const surfaceLabels: Readonly<Record<DrivingSurfaceKind, string>> = {
  "paved-road": "Paved road",
  dry: "Dry",
  dirt: "Dirt",
  wet: "Wet",
  grass: "Grass",
  snow: "Snow",
  ice: "Ice",
  other: "Other",
};

export function surfaceLabel(kind: DrivingSurfaceKind): string {
  return surfaceLabels[kind];
}

export function liveDiagnosticsRows(live: LiveDiagnostics): readonly DiagnosticsRow[] {
  return [
    { label: "Mode", value: live.mode },
    { label: "FPS", value: live.fps === undefined ? "—" : live.fps.toFixed(0) },
    { label: "Cache", value: live.installStage ? `${live.installStage} · ${live.loadedSectors} live` : `${live.loadedSectors} live` },
    { label: "Field", value: live.fieldNumber === undefined ? "—" : `FLD/${live.fieldNumber.toString().padStart(3, "0")}` },
    {
      label: "Position",
      value: live.position ? `${live.position.x.toFixed(2)}, ${live.position.y.toFixed(2)}, ${live.position.z.toFixed(2)}` : "—",
    },
    { label: "Surface", value: live.surface ? surfaceLabel(live.surface) : "—" },
  ];
}

/** Plain-text snapshot a developer can paste straight into a bug report. */
export function diagnosticsReportText(rows: readonly DiagnosticsRow[], context: { readonly capturedAt: string; readonly userAgent: string }): string {
  const width = rows.reduce((longest, row) => Math.max(longest, row.label.length), 0);
  const body = rows.map((row) => `${row.label.padEnd(width)}  ${row.value}`);
  return ["RTAO developer diagnostics", `Captured  ${context.capturedAt}`, `Browser   ${context.userAgent}`, "", ...body].join("\n");
}

/** Rolling frame-rate estimate over the most recent frames. */
export class FrameRateSampler {
  private readonly frameMs: number[] = [];
  private previousTimestamp: number | undefined;

  constructor(private readonly window = 30) {}

  sample(timestampMs: number): void {
    if (this.previousTimestamp !== undefined) {
      const delta = timestampMs - this.previousTimestamp;
      if (delta > 0) {
        this.frameMs.push(delta);
        if (this.frameMs.length > this.window) this.frameMs.shift();
      }
    }
    this.previousTimestamp = timestampMs;
  }

  reset(): void {
    this.frameMs.length = 0;
    this.previousTimestamp = undefined;
  }

  get fps(): number | undefined {
    if (this.frameMs.length === 0) return undefined;
    const mean = this.frameMs.reduce((total, delta) => total + delta, 0) / this.frameMs.length;
    return 1000 / mean;
  }
}
