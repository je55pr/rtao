import { describe, expect, test } from "vitest";
import { createNativeChaseCameraState } from "./nativeChaseCamera";
import {
  nativeCameraFinalOutput,
  nativeCameraProjectionContract,
  nativeCameraWorldMatrix,
} from "./nativeCameraFinalOutput";
import { nativeRaceIdentity } from "./nativeRaceMath";

describe("native camera final output", () => {
  test("matches the recovered preset-0 eye and forward oracle", () => {
    const output = nativeCameraFinalOutput(
      createNativeChaseCameraState(0),
      nativeRaceIdentity(),
    );
    expect(output.eye[0]).toBeCloseTo(0, 7);
    expect(output.eye[1]).toBeCloseTo(2.593206, 6);
    expect(output.eye[2]).toBeCloseTo(-6.802594, 6);
    expect(output.forward[0]).toBeCloseTo(0, 7);
    expect(output.forward[1]).toBeCloseTo(-0.085797, 6);
    expect(output.forward[2]).toBeCloseTo(0.996313, 6);
    expect(output.focal).toBe(500);
  });

  test("uses mutable descriptor offset, focal and +0x14 pitch", () => {
    const state = {
      ...createNativeChaseCameraState(0),
      localOffset: [0, 1, -2, 1] as const,
      focal: 461,
      pitchAngle: 0,
    };
    const output = nativeCameraFinalOutput(state, nativeRaceIdentity());
    expect(output.eye).toEqual([0, 1, -2]);
    expect(output.forward).toEqual([0, 0, 1]);
    expect(output.focal).toBe(461);
  });

  test("applies world translation after native local camera rotation", () => {
    const matrix = nativeCameraWorldMatrix(nativeRaceIdentity(), [100, 5, 200]);
    const output = nativeCameraFinalOutput(createNativeChaseCameraState(0), matrix);
    expect(output.eye[0]).toBeCloseTo(100, 6);
    expect(output.eye[1]).toBeCloseTo(7.593206, 6);
    expect(output.eye[2]).toBeCloseTo(193.197406, 5);
    expect(output.forward[0]).toBeCloseTo(0, 7);
    expect(output.forward[1]).toBeCloseTo(-0.085797, 6);
    expect(output.forward[2]).toBeCloseTo(0.996313, 6);
  });

  test("reproduces both recovered display-scale projection families", () => {
    const p500Mode0 = nativeCameraProjectionContract(500, 0);
    expect(p500Mode0.horizontalFovDegrees).toBeCloseTo(65.238486142, 9);
    expect(p500Mode0.verticalFovDegrees).toBeCloseTo(50.964540461, 9);
    expect(p500Mode0.aspect).toBeCloseTo(1.342857139451, 9);
    expect(p500Mode0.normalizedFocal).toBe(500 / 512);
    expect(p500Mode0.near).toBe(1.5);
    expect(p500Mode0.far).toBe(65_536);
    expect(p500Mode0.perspectiveDepthScale).toBe(1.0000457763671875);
    expect(p500Mode0.perspectiveDepthBias).toBe(-3.0000686645507812);
    expect(p500Mode0.gsViewportScale[0]).toBe(512);
    expect(p500Mode0.gsViewportScale[1]).toBeCloseTo(240.64, 4);
    expect(p500Mode0.gsReverseDepthScale).toBe(-8_388_499.5);
    expect(p500Mode0.gsReverseDepthBias).toBe(8_388_500.5);
    expect(p500Mode0.center).toEqual([2048, 2048]);

    const p500Mode1 = nativeCameraProjectionContract(500, 1);
    expect(p500Mode1.horizontalFovDegrees).toBeCloseTo(77.319615675, 9);
    expect(p500Mode1.verticalFovDegrees).toBeCloseTo(45.821876738, 9);
    expect(p500Mode1.aspect).toBeCloseTo(1.892857012472, 9);

    const p461Mode0 = nativeCameraProjectionContract(461, 0);
    expect(p461Mode0.horizontalFovDegrees).toBeCloseTo(69.532367978, 9);
    expect(p461Mode0.verticalFovDegrees).toBeCloseTo(54.670252745, 9);

    const p461Mode1 = nativeCameraProjectionContract(461, 1);
    expect(p461Mode1.horizontalFovDegrees).toBeCloseTo(81.894976146, 9);
    expect(p461Mode1.verticalFovDegrees).toBeCloseTo(49.253107022, 9);
  });

  test("retains the three decoded projection-center pairs without guessing semantics", () => {
    expect(nativeCameraProjectionContract(500, 0, "ordinary").center).toEqual([2048, 2048]);
    expect(nativeCameraProjectionContract(500, 0, "state-2").center).toEqual([2048, 1992]);
    expect(nativeCameraProjectionContract(500, 0, "state-3").center).toEqual([2048, 2104]);
  });
});
