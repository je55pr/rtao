export interface NativeRacePositionCar {
  readonly carIndex: number;
  /** Native high creation/runtime halfword at car +0x198. */
  readonly flags: number;
  /** Native byte +0x19B, read as signed by the ranking routine. */
  readonly completedLaps: number;
  readonly finishGatePhase: number;
  readonly navigationOutput: number;
  /** Native float +0x24C; supplied by navigation, not inferred from record number. */
  readonly navigationDistance: number;
}

/**
 * Ordinary live-order insertion sort 0x0022ED38. Finished cars (0x0200) keep
 * their awarded place; active cars are ranked after the current finish count.
 * Exact ties retain ascending native car-slot order.
 */
export function nativeRacePositions(cars: readonly NativeRacePositionCar[], finishCount: number): readonly { carIndex: number; positionIndex: number }[] {
  if (!Number.isInteger(finishCount) || finishCount < 0 || finishCount > 24) throw new RangeError("Invalid native race finish count.");
  const indices = new Set<number>();
  for (const car of cars) {
    if (!Number.isInteger(car.carIndex) || car.carIndex < 0 || car.carIndex > 23 || indices.has(car.carIndex) ||
      ![car.completedLaps, car.finishGatePhase, car.navigationOutput].every(v => Number.isInteger(v) && v >= 0 && v <= 255) ||
      !Number.isFinite(car.navigationDistance)) throw new RangeError("Invalid native race position record.");
    indices.add(car.carIndex);
  }
  const effectiveLap = (car: NativeRacePositionCar): number => ((car.completedLaps << 24) >> 24) - (car.finishGatePhase < 2 ? 1 : 0);
  const ranked = cars.filter(car => (car.flags & 65535) !== 0 && (car.flags & 0x200) === 0).sort((a, b) =>
    effectiveLap(b) - effectiveLap(a) || b.finishGatePhase - a.finishGatePhase ||
    b.navigationOutput - a.navigationOutput || Math.fround(a.navigationDistance) - Math.fround(b.navigationDistance) ||
    a.carIndex - b.carIndex);
  return ranked.map((car, i) => ({ carIndex: car.carIndex, positionIndex: finishCount + i }));
}
