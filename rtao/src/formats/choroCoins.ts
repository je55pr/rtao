import { fieldNumberFromAreaCode } from "../game/worldTopology";
import { Elf32AddressSpace } from "./elf32";

export const CHORO_COIN_COUNT = 100;
export const CHORO_COIN_PLACEMENT_TABLE_ADDRESS = 0x002a9020;
export const CHORO_COIN_PLACEMENT_STRIDE = 16;

export interface ChoroCoinPlacement {
  readonly index: number;
  readonly areaCode: number;
  readonly fieldNumber: number;
  /** Authored PAL field-local coordinates before the browser X reflection. */
  readonly sourcePosition: {
    readonly x: number;
    readonly y: number;
    readonly z: number;
  };
}

/** Reads the executable-authored 100-record ChoroQ coin placement table. */
export function readChoroCoinPlacements(executableBytes: Uint8Array): readonly ChoroCoinPlacement[] {
  const elf = new Elf32AddressSpace(executableBytes);
  return Object.freeze(Array.from({ length: CHORO_COIN_COUNT }, (_, index) => {
    const address = CHORO_COIN_PLACEMENT_TABLE_ADDRESS + index * CHORO_COIN_PLACEMENT_STRIDE;
    const areaCode = elf.u32(address + 12);
    return Object.freeze({
      index,
      areaCode,
      fieldNumber: fieldNumberFromAreaCode(areaCode),
      sourcePosition: Object.freeze({
        x: elf.f32(address),
        y: elf.f32(address + 4),
        z: elf.f32(address + 8),
      }),
    });
  }));
}
