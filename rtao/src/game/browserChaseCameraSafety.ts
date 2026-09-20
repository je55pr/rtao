import type { NativeChaseVector } from "./nativeChaseCamera";
import type { NativeCameraRenderSelection } from "./nativeCameraRuntimeContract";

export interface BrowserChasePose {
  readonly position: NativeChaseVector;
  readonly target: NativeChaseVector;
}

export interface BrowserChaseObstruction {
  readonly y: number;
}

/**
 * Host selection only. The retained table proves record 0's values, but the
 * recovered handoff does not prove the upstream initial native selector.
 */
export const browserOrdinaryChasePresetIndex = 0;

/**
 * Host rendering safety only. This is deliberately separate from PAL's
 * gp-0x3e60 collision-query correction loop and must not be described as
 * native camera behavior.
 */
export function applyBrowserChaseObstructionSafety(
  pose: BrowserChasePose,
  sampleHighest: (point: { x: number; y: number; z: number }) => BrowserChaseObstruction | undefined,
  sampleCount = 6,
  clearance = 1.8,
): BrowserChasePose {
  if (!Number.isInteger(sampleCount) || sampleCount < 1) {
    throw new RangeError("Browser chase obstruction sample count must be a positive integer.");
  }
  let cameraY = pose.position[1];
  const [targetX, targetY, targetZ] = pose.target;
  const [cameraX, , cameraZ] = pose.position;
  for (let step = 1; step <= sampleCount; step += 1) {
    const fraction = step / sampleCount;
    const obstruction = sampleHighest({
      x: targetX + (cameraX - targetX) * fraction,
      y: targetY,
      z: targetZ + (cameraZ - targetZ) * fraction,
    });
    if (obstruction) cameraY = Math.max(cameraY, obstruction.y + clearance);
  }
  if (cameraY === pose.position[1]) return pose;
  return {
    position: [pose.position[0], cameraY, pose.position[2]],
    target: pose.target,
  };
}

/**
 * Native final output has its own pre-render obstruction stage. Never apply
 * the browser height-clearance fallback on top of a native-resolved frame.
 */
export function applyBrowserChaseSafetyToSelection(
  selection: NativeCameraRenderSelection,
  sampleHighest: (point: { x: number; y: number; z: number }) => BrowserChaseObstruction | undefined,
): BrowserChasePose {
  return selection.source === "native-final-output"
    ? selection.pose
    : applyBrowserChaseObstructionSafety(selection.pose, sampleHighest);
}
