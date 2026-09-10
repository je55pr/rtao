import { advertisingSponsorCount } from "./commerceProgress";

export interface AdvertisingDistanceSink {
  addAdvertisingDistanceUnits(sponsorIndex: number, distanceUnits: number): boolean;
}

export interface AdvertisingDistanceRecord {
  readonly addedUnits: number;
  readonly saveRecommended: boolean;
}

export class AdvertisingDistanceTracker {
  private lastDistanceTravelled = 0;
  private readonly fractions = Array<number>(advertisingSponsorCount).fill(0);
  private unsavedDistanceUnits = 0;

  constructor(private readonly saveThresholdUnits = 100) {}

  reset(distanceTravelled = 0): void {
    this.lastDistanceTravelled = distanceTravelled;
    this.fractions.fill(0);
    this.unsavedDistanceUnits = 0;
  }

  record(
    distanceTravelled: number,
    sponsorIndex: number | undefined,
    sink: AdvertisingDistanceSink | undefined,
  ): AdvertisingDistanceRecord {
    const delta = distanceTravelled - this.lastDistanceTravelled;
    this.lastDistanceTravelled = distanceTravelled;
    if (!(delta > 0) || sponsorIndex === undefined || !sink) {
      return { addedUnits: 0, saveRecommended: false };
    }

    this.fractions[sponsorIndex] = this.fractions[sponsorIndex]! + delta;
    const addedUnits = Math.floor(this.fractions[sponsorIndex]!);
    if (addedUnits <= 0) return { addedUnits: 0, saveRecommended: false };

    this.fractions[sponsorIndex] -= addedUnits;
    sink.addAdvertisingDistanceUnits(sponsorIndex, addedUnits);
    this.unsavedDistanceUnits += addedUnits;
    if (this.unsavedDistanceUnits < this.saveThresholdUnits) {
      return { addedUnits, saveRecommended: false };
    }
    this.unsavedDistanceUnits = 0;
    return { addedUnits, saveRecommended: true };
  }
}
