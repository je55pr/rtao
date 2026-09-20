import { Elf32AddressSpace } from "../formats/elf32";
import {
  nativeRaceNormalBasis,
  type NativeRaceMatrix,
  type NativeRaceVector,
} from "./nativeRaceMath";

export interface NativeRaceBodyData {
  readonly bodySideDivisor: number;
  readonly bodyForwardDivisor: number;
  readonly bigTyreLift: number;
}

const f = Math.fround;
const gp = 0x3dd7f0;

export function readNativeRaceBodyData(executable: Uint8Array): NativeRaceBodyData {
  const elf = new Elf32AddressSpace(executable);
  return {
    bodySideDivisor: elf.f32(gp - 32472),
    bodyForwardDivisor: elf.f32(gp - 32468),
    bigTyreLift: elf.f32(gp - 32464),
  };
}

/** PAL 0x21D440..0x21D4B8 suspension/body-attitude recurrence. */
export function nativeRaceBodyMatrix(
  support: readonly number[],
  equipmentFlags: number,
  data: NativeRaceBodyData,
): NativeRaceMatrix {
  if (support.length !== 3 || support.some((value) => !Number.isFinite(value))) {
    throw new RangeError("Native body attitude requires three finite support values.");
  }
  if (!Number.isFinite(data.bodySideDivisor) || data.bodySideDivisor === 0
    || !Number.isFinite(data.bodyForwardDivisor) || data.bodyForwardDivisor === 0
    || !Number.isFinite(data.bigTyreLift)) {
    throw new RangeError("Invalid native body-attitude constants.");
  }
  const [front, left, right] = support.map((value) => value | 0);
  const rearAverage = Math.trunc(((left! + right!) | 0) / 2);
  const normal: NativeRaceVector = [
    f(f((right! - left!) | 0) / data.bodySideDivisor),
    1,
    f(f((front! - rearAverage) | 0) / data.bodyForwardDivisor),
    0,
  ];
  const matrix = nativeRaceNormalBasis(normal);
  matrix[13] = f(
    f(
      f((Math.trunc(((front! + rearAverage) | 0) / 2) - 4096) | 0) * (-1 / 32768),
    ) + ((equipmentFlags & 0x400) !== 0 ? data.bigTyreLift : 0),
  );
  return matrix;
}
