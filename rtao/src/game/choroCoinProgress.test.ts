import { describe, expect, test } from "vitest";
import type { ChoroCoinPlacement } from "../formats/choroCoins";
import { DialogueRuntimeState } from "../formats/dialogue";
import {
  CHORO_COIN_PICKUP_RADIUS,
  choroCoinRenderPosition,
  collectNearbyChoroCoin,
} from "./choroCoinProgress";

const placement: ChoroCoinPlacement = {
  index: 7,
  areaCode: 7,
  fieldNumber: 13,
  sourcePosition: { x: 110, y: 25.5, z: 48 },
};

describe("ChoroQ coin progress", () => {
  test("reflects authored X into browser field-local coordinates", () => {
    expect(choroCoinRenderPosition(placement)).toEqual({ x: 1490, y: 25.5, z: 48 });
  });

  test("collects the first available same-field coin inside PAL's strict radius", () => {
    const state = new DialogueRuntimeState();
    const result = collectNearbyChoroCoin(state, [placement], 13, { x: 1490.5, y: 25.5, z: 48 });
    expect(result).toMatchObject({ placement, collectedCount: 1 });
    expect(state.choroCoinEntries()).toEqual([7]);
    expect(state.revision).toBe(1);
    expect(collectNearbyChoroCoin(state, [placement], 13, { x: 1490, y: 25.5, z: 48 })).toBeUndefined();
  });

  test("does not collect across fields or at the exact 1.4-unit boundary", () => {
    const state = new DialogueRuntimeState();
    const coin = choroCoinRenderPosition(placement);
    expect(collectNearbyChoroCoin(state, [placement], 12, coin)).toBeUndefined();
    expect(collectNearbyChoroCoin(state, [placement], 13, {
      x: coin.x + CHORO_COIN_PICKUP_RADIUS,
      y: coin.y,
      z: coin.z,
    })).toBeUndefined();
    expect(state.choroCoinCollectedCount).toBe(0);
  });

  test("preserves native table order when multiple coins are within range", () => {
    const state = new DialogueRuntimeState();
    const first = { ...placement, index: 2 };
    const second = { ...placement, index: 3, sourcePosition: { ...placement.sourcePosition, x: 110.2 } };
    const result = collectNearbyChoroCoin(state, [first, second], 13, { x: 1490, y: 25.5, z: 48 });
    expect(result?.placement.index).toBe(2);
    expect(state.choroCoinEntries()).toEqual([2]);
  });
});
