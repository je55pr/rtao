import { describe, expect, test } from "vitest";
import { RecoveredCommerceState } from "./commerceProgress";
import { AdvertisingDistanceTracker } from "./advertisingDistanceTracker";

describe("AdvertisingDistanceTracker", () => {
  test("accumulates fractional world distance into native sponsor units", () => {
    const tracker = new AdvertisingDistanceTracker();
    const commerce = new RecoveredCommerceState();
    expect(tracker.record(0.4, 0, commerce)).toEqual({ addedUnits: 0, saveRecommended: false });
    expect(tracker.record(1.1, 0, commerce)).toEqual({ addedUnits: 1, saveRecommended: false });
    expect(commerce.advertisingDistanceEntries()[0]).toBe(1);
  });

  test("distance travelled without a fitted sponsor is not backfilled later", () => {
    const tracker = new AdvertisingDistanceTracker();
    const commerce = new RecoveredCommerceState();
    tracker.record(25, undefined, commerce);
    tracker.record(26, 1, commerce);
    expect(commerce.advertisingDistanceEntries()).toEqual([0, 1, 0, 0, 0]);
  });

  test("requests a save after each hundred newly persisted distance units", () => {
    const tracker = new AdvertisingDistanceTracker(100);
    const commerce = new RecoveredCommerceState();
    expect(tracker.record(99.5, 2, commerce).saveRecommended).toBe(false);
    expect(tracker.record(100.2, 2, commerce)).toEqual({ addedUnits: 1, saveRecommended: true });
    expect(commerce.advertisingDistanceEntries()[2]).toBe(100);
    expect(tracker.record(199.9, 2, commerce).saveRecommended).toBe(false);
    expect(tracker.record(200.4, 2, commerce).saveRecommended).toBe(true);
  });

  test("reset starts a fresh driving session without carrying fractions", () => {
    const tracker = new AdvertisingDistanceTracker();
    const commerce = new RecoveredCommerceState();
    tracker.record(0.9, 0, commerce);
    tracker.reset();
    expect(tracker.record(0.2, 0, commerce).addedUnits).toBe(0);
    expect(commerce.advertisingDistanceEntries()[0]).toBe(0);
  });
});
