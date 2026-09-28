import type { NativeRaceMatrix, NativeRaceVector } from "../src/game/nativeRaceMath";
import { PalScalarMachine } from "./palScalarMachine";

export interface PalRaceVehicleCollisionCar {
  readonly carIndex: number;
  readonly carFlags: number;
  readonly position: readonly [number, number, number];
  readonly velocity: NativeRaceVector;
  readonly coordinates: NativeRaceVector;
  readonly inverse: NativeRaceMatrix;
  readonly hardpoints: readonly NativeRaceVector[];
}

export interface PalRaceVehicleCollisionResult {
  readonly cars: readonly {
    carIndex: number;
    position: readonly [number, number, number];
    velocity: NativeRaceVector;
  }[];
  readonly eventPairs: readonly [number, number][];
}

const carBase = 0x1820470;
const carStride = 0x270;
const scene = 0x1800000;
const context = 0x1801000;

export function palRaceVehicleCollisionOracle(executable: Uint8Array) {
  // PAL startup 0x00200118 clears FCR31, so this task's CVT.W.S position
  // writes use round-to-nearest, ties-to-even. Keep this scoped because the
  // shared bounded oracle's legacy default is part of older archaeology gates.
  const machine = new PalScalarMachine(executable, { cvtWsRounding: "nearest-even" });
  const view = machine.view;
  const putInts = (address: number, values: readonly number[]) =>
    values.forEach((value, index) => view.setInt32(address + index * 4, value, true));
  const putFloats = (address: number, values: readonly number[]) =>
    values.forEach((value, index) => view.setFloat32(address + index * 4, value, true));
  const ints = (address: number, count: number) =>
    Array.from({ length: count }, (_, index) => view.getInt32(address + index * 4, true));

  return {
    machine,
    run(cars: readonly PalRaceVehicleCollisionCar[], sceneFlags = 0): PalRaceVehicleCollisionResult {
      if (cars.length > 24) throw new RangeError("PAL collision oracle supports at most 24 car slots.");
      machine.memory.fill(0, carBase, carBase + carStride * 24);
      view.setUint32(scene + 0x28, sceneFlags >>> 0, true);

      const byIndex = new Map<number, PalRaceVehicleCollisionCar>();
      for (const car of cars) {
        if (car.carIndex < 0 || car.carIndex > 23 || byIndex.has(car.carIndex)) {
          throw new RangeError("PAL collision oracle needs unique car slots 0..23.");
        }
        if (car.hardpoints.length !== 4) throw new RangeError("PAL collision oracle needs four car hardpoints.");
        byIndex.set(car.carIndex, car);
        const address = carBase + car.carIndex * carStride;
        putFloats(address + 0x90, car.coordinates);
        putInts(address + 0xa0, car.position);
        putFloats(address + 0xb0, car.inverse);
        putInts(address + 0xf0, car.velocity);
        car.hardpoints.forEach((point, index) => putFloats(address + 0x140 + index * 0x10, point));
        view.setUint16(address + 0x198, car.carFlags, true);
      }

      const eventPairs: [number, number][] = [];
      machine.run(0x218888, [context, scene], {
        // Event/audio response is recovered separately. This oracle isolates
        // the pair admission and physical response while recording invocation.
        0x2186d0: (arguments_) => {
          const first = Math.trunc((arguments_[2]! - carBase) / carStride);
          const second = Math.trunc((arguments_[3]! - carBase) / carStride);
          eventPairs.push([first, second]);
          return 0;
        },
      }, { maxSteps: 500_000 });

      return {
        cars: [...byIndex.keys()].sort((a, b) => a - b).map((carIndex) => {
          const address = carBase + carIndex * carStride;
          return {
            carIndex,
            position: ints(address + 0xa0, 3) as [number, number, number],
            velocity: ints(address + 0xf0, 4) as unknown as NativeRaceVector,
          };
        }),
        eventPairs,
      };
    },
  };
}
