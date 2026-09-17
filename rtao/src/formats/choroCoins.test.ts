import { describe, expect, test } from "vitest";
import {
  CHORO_COIN_COUNT,
  CHORO_COIN_PLACEMENT_STRIDE,
  readChoroCoinPlacements,
} from "./choroCoins";

describe("ChoroQ coin placement table", () => {
  test("reads all 100 executable-authored position/area records", () => {
    const bytes = coinTableElf();
    const view = new DataView(bytes.buffer);
    const first = 0x100;
    view.setFloat32(first, 529, true);
    view.setFloat32(first + 4, 20.5, true);
    view.setFloat32(first + 8, 1499, true);
    view.setUint32(first + 12, 6, true);
    const last = first + (CHORO_COIN_COUNT - 1) * CHORO_COIN_PLACEMENT_STRIDE;
    view.setFloat32(last, 860, true);
    view.setFloat32(last + 4, 48.8, true);
    view.setFloat32(last + 8, 1356, true);
    view.setUint32(last + 12, 47, true);

    const placements = readChoroCoinPlacements(bytes);
    expect(placements).toHaveLength(100);
    expect(placements[0]).toEqual({
      index: 0,
      areaCode: 6,
      fieldNumber: 12,
      sourcePosition: { x: 529, y: 20.5, z: 1499 },
    });
    expect(placements[99]).toMatchObject({
      index: 99,
      areaCode: 47,
      fieldNumber: 233,
    });
    expect(placements[99]?.sourcePosition.y).toBeCloseTo(48.8, 5);
  });
});

function coinTableElf(): Uint8Array {
  const fileOffset = 0x100;
  const tableLength = CHORO_COIN_COUNT * CHORO_COIN_PLACEMENT_STRIDE;
  const bytes = new Uint8Array(fileOffset + tableLength);
  const view = new DataView(bytes.buffer);
  bytes.set([0x7f, 0x45, 0x4c, 0x46, 1, 1], 0);
  view.setUint32(0x1c, 0x34, true);
  view.setUint16(0x2a, 32, true);
  view.setUint16(0x2c, 1, true);
  view.setUint32(0x34, 1, true);
  view.setUint32(0x38, fileOffset, true);
  view.setUint32(0x3c, 0x002a9020, true);
  view.setUint32(0x44, tableLength, true);
  view.setUint32(0x48, tableLength, true);
  for (let index = 0; index < CHORO_COIN_COUNT; index += 1) {
    view.setUint32(fileOffset + index * CHORO_COIN_PLACEMENT_STRIDE + 12, 0, true);
  }
  return bytes;
}
