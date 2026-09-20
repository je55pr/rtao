import { expect, test } from "vitest";
import {
  applyBrowserChaseObstructionSafety,
  applyBrowserChaseSafetyToSelection,
  browserOrdinaryChasePresetIndex,
} from "./browserChaseCameraSafety";

test("ordinary browser preset choice remains explicit host policy", () => {
  expect(browserOrdinaryChasePresetIndex).toBe(0);
});

test("browser obstruction safety stays a post-native rendering adjustment", () => {
  const nativePose = {
    position: [0, 2, -7] as const,
    target: [0, 0, 0] as const,
  };
  const clear = applyBrowserChaseObstructionSafety(nativePose, () => undefined);
  expect(clear).toBe(nativePose);

  const raised = applyBrowserChaseObstructionSafety(
    nativePose,
    (point) => point.z < -3 ? { y: 3 } : undefined,
  );
  expect(raised.position).toEqual([0, 4.8, -7]);
  expect(raised.target).toEqual(nativePose.target);
});

test("browser obstruction safety never alters native final output", () => {
  const nativePose = {
    position: [0, 2, -7] as const,
    target: [0, 0, 0] as const,
  };
  const resolved = applyBrowserChaseSafetyToSelection(
    { source: "native-final-output", pose: nativePose },
    () => ({ y: 100 }),
  );
  expect(resolved).toBe(nativePose);
});
