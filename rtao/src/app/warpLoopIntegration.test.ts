import { describe, expect, test, vi } from "vitest";
import {
  DialogueFlow,
  DialogueRuntimeState,
  type DialogueEntity,
} from "../formats/dialogue";
import type {
  AuthoredAreaDescriptor,
  FixedInteractionDefinition,
} from "../formats/overworld";
import {
  createRecoveredDialogueStateSave,
  restoreRecoveredDialogueStateSave,
} from "../game/dialogueProgress";
import {
  resolveWarpWorldEntry,
  runRegisteredCityWarp,
} from "../game/warpTravel";
import { createWarpMenuState } from "./warpMenuState";

const catalogue: readonly AuthoredAreaDescriptor[] = [
  area(0, "My Garage", 65),
  area(1, "Peach Town", 43, 223),
  area(2, "Fuji City", 23, 113),
  area(3, "Sand Polis", 5, 212),
];

const interactions: readonly FixedInteractionDefinition[] = [
  fixedInteraction(1, 223, [
    [512.1, 432.1],
    [505.89, 430.84],
    [504.86, 433.63],
    [511.42, 435.19],
  ]),
  fixedInteraction(2, 113, [
    [1023.8, 1172.7],
    [1023.8, 1168.4],
    [1018.8, 1168.4],
    [1018.8, 1172.7],
  ]),
];

describe("complete ordinary-city Warp loop", () => {
  test("registration gates the menu and transition, selector zero reaches Q's Factory, and registrations survive reload", async () => {
    const state = new DialogueRuntimeState();
    expect(createWarpMenuState(state, catalogue).destinations).toEqual([]);

    const enter = vi.fn();
    await expect(runRegisteredCityWarp(2, state, catalogue, enter)).rejects.toThrow(/not registered/);
    expect(enter).not.toHaveBeenCalled();

    new DialogueFlow(factoryEntity(1), state, 4);
    expect(createWarpMenuState(state, catalogue).destinations).toEqual([
      { areaIndex: 1, name: "Peach Town" },
    ]);
    expect(state.hasWarpRegistration(2)).toBe(false);

    const peach = await runRegisteredCityWarp(1, state, catalogue, enter);
    const peachEntry = resolveWarpWorldEntry(peach, interactions);
    expect(peachEntry.interaction.fieldNumber).toBe(223);
    expect(peachEntry.position.x).toBeCloseTo(1091.86, 5);
    expect(peachEntry.position.z).toBeCloseTo(434.41, 5);

    new DialogueFlow(factoryEntity(2), state, 4);
    expect(createWarpMenuState(state, catalogue).destinations).toEqual([
      { areaIndex: 1, name: "Peach Town" },
      { areaIndex: 2, name: "Fuji City" },
    ]);

    const fuji = await runRegisteredCityWarp(2, state, catalogue, enter);
    const fujiEntry = resolveWarpWorldEntry(fuji, interactions);
    expect(fujiEntry.interaction.fieldNumber).toBe(113);
    expect(fujiEntry.position.x).toBeCloseTo(581.2, 5);
    expect(fujiEntry.position.z).toBeCloseTo(1170.55, 5);
    expect(enter).toHaveBeenLastCalledWith(fuji);

    const saved = createRecoveredDialogueStateSave(state, "2026-09-17T22:30:00.000Z");
    const restored = restoreRecoveredDialogueStateSave(saved, new DialogueRuntimeState());
    expect(createWarpMenuState(restored, catalogue).destinations).toEqual([
      { areaIndex: 1, name: "Peach Town" },
      { areaIndex: 2, name: "Fuji City" },
    ]);
    expect(restored.hasWarpRegistration(3)).toBe(false);
  });
});

function factoryEntity(areaIndex: number): DialogueEntity {
  return {
    areaIndex,
    entityIndex: 0,
    entityAddress: 0,
    name: "Q's Factory",
    variants: [{
      pointerTableSlot: 4,
      textAddress: 0,
      bytes: new Uint8Array(),
      tokens: [],
      pages: ["Welcome"],
    }],
  };
}

function area(
  areaIndex: number,
  name: string,
  areaCode: number,
  fieldNumber?: number,
): AuthoredAreaDescriptor {
  return {
    areaIndex,
    name,
    areaCode,
    fixedInteractionCount: areaIndex === 0 ? 0 : 1,
    outdoorResidentCount: 0,
    ...(fieldNumber === undefined ? {} : { fieldNumber }),
  };
}

function fixedInteraction(
  areaIndex: number,
  fieldNumber: number,
  corners: ReadonlyArray<readonly [number, number]>,
): FixedInteractionDefinition {
  return {
    areaIndex,
    fieldNumber,
    localIndex: 0,
    name: "Q's Factory Staff",
    bodyId: 28,
    paint: {
      primary: { r: 25, g: 38, b: 216 },
      secondary: { r: 216, g: 216, b: 216 },
    },
    corners,
  };
}
