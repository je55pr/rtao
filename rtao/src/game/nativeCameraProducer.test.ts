import { describe, expect, test } from "vitest";
import {
  nativeCameraFinalOutput,
  nativeCameraWorldMatrix,
} from "./nativeCameraFinalOutput";
import { materializeNativeCameraFinalOutput } from "./nativeCameraProducer";
import {
  createNativeCameraRuntimeContractState,
  withNativeCameraFinalOutput,
} from "./nativeCameraRuntimeContract";
import { advanceNativeCameraWorldTransform } from "./nativeCameraWorldTransform";
import type { NativeRaceMathData } from "./nativeRaceMath";

const math: NativeRaceMathData = {
  rotationCoefficients: [
    Math.fround(1 / 362_880),
    Math.fround(-1 / 5_040),
    Math.fround(1 / 120),
    Math.fround(-1 / 6),
  ],
  normalYThreshold: 0.5,
  normalYIncrement: 0.1,
};

describe("native camera producer", () => {
  test("atomically associates final output with the controller snapshot that produced it", () => {
    const stale = withNativeCameraFinalOutput(
      createNativeCameraRuntimeContractState(0),
      { eye: [9, 9, 9], forward: [1, 0, 0], focal: 123 },
    );
    const inputs = {
      world: {
        sourceVector: [0, 1, 0.005, 0] as const,
        offset50: 0,
        offset58: 0,
        nativeYaw: 0,
      },
      translation: [100, 5, 200] as const,
      math,
    };

    const produced = materializeNativeCameraFinalOutput(stale, inputs);
    const world = advanceNativeCameraWorldTransform(stale.controller, inputs.world, math);
    const worldMatrix = nativeCameraWorldMatrix(world.orientationMatrix, inputs.translation);
    const expected = nativeCameraFinalOutput(world.controller, worldMatrix);

    expect(produced.state.controller).toEqual(world.controller);
    expect(produced.state.finalOutput).toEqual(expected);
    expect(produced.worldMatrix).toEqual(worldMatrix);
    expect(produced.auxiliaryMatrix).toEqual(world.auxiliaryMatrix);
    expect(produced.state.finalOutput).not.toEqual(stale.finalOutput);
  });

  test("does not invent unresolved host inputs", () => {
    const state = createNativeCameraRuntimeContractState(0);
    expect(() => materializeNativeCameraFinalOutput(state, {
      world: {
        sourceVector: [0, 1, 0, 0],
        offset50: 0,
        offset58: 0,
        nativeYaw: 0,
      },
      translation: [Number.NaN, 0, 0],
      math,
    })).toThrow("translation requires finite coordinates");
  });
});
