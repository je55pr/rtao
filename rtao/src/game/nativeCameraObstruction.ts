import type { NativeChaseCameraState } from "./nativeChaseCamera";
import type {
  NativeCameraFinalOutput,
  NativeCameraObstructionQuery,
  NativeCameraVector,
} from "./nativeCameraRuntimeContract";

export type NativeCameraNearEdgeProbes = readonly [
  NativeCameraVector,
  NativeCameraVector,
];

export interface NativeCameraObstructionBuild {
  readonly finalOutput: NativeCameraFinalOutput;
  /** Transformed lower-left/lower-right near-edge points at output +0x100/+0x110. */
  readonly nearLowerProbes: NativeCameraNearEdgeProbes;
}

export interface NativeCameraObstructionContext {
  /** Raw controller/context +0x28 flags. Bit 0x8000 bypasses the recovered loop. */
  readonly contextFlags28?: number;
  /** Raw scene/controller byte +0x0B. Nonzero bypasses the recovered loop. */
  readonly sceneByte0B?: number;
}

export interface NativeCameraObstructionResult extends NativeCameraObstructionBuild {
  readonly controller: NativeChaseCameraState;
  readonly adjustmentCount: number;
  readonly terminatedAtBoundary: boolean;
}

export type NativeCameraObstructionBuilder = (
  controller: NativeChaseCameraState,
) => NativeCameraObstructionBuild;

const correctionSteps = [-0x80, 0x80] as const;

/**
 * Replays PAL's two lower near-edge collision-height correction loops.
 * The builder must rebuild output/probes after every +0x16 angle adjustment.
 */
export function resolveNativeCameraObstruction(
  initialController: NativeChaseCameraState,
  build: NativeCameraObstructionBuilder,
  query: NativeCameraObstructionQuery,
  context: NativeCameraObstructionContext = {},
): NativeCameraObstructionResult {
  let controller = initialController;
  let frame = build(controller);
  let adjustmentCount = 0;

  if (controller.modeFlags !== 0
    || ((context.contextFlags28 ?? 0) & 0x8000) !== 0
    || (context.sceneByte0B ?? 0) !== 0) {
    return { controller, ...frame, adjustmentCount, terminatedAtBoundary: false };
  }

  for (let side = 0; side < correctionSteps.length; side += 1) {
    while (true) {
      const probe = frame.nearLowerProbes[side]!;
      const sample = query({ point: probe });
      if (sample.correctedY !== undefined && !Number.isFinite(sample.correctedY)) {
        throw new RangeError("Native camera obstruction corrected height must be finite.");
      }
      const obstructed = !sample.valid
        || (sample.correctedY !== undefined && sample.correctedY > probe[1]);
      if (!obstructed) break;

      const nextAngle = adjustedSignedAngle(
        controller.recenter.angle,
        correctionSteps[side]!,
      );
      if (nextAngle === undefined) {
        return { controller, ...frame, adjustmentCount, terminatedAtBoundary: true };
      }
      controller = {
        ...controller,
        recenter: { ...controller.recenter, angle: nextAngle },
      };
      adjustmentCount += 1;
      frame = build(controller);
    }
  }

  return { controller, ...frame, adjustmentCount, terminatedAtBoundary: false };
}

function adjustedSignedAngle(value: number, step: number): number | undefined {
  const current = (value << 16) >> 16;
  const next = current + step;
  if (next < -0x8000 || next > 0x7fff) return undefined;
  return next;
}
