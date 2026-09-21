import type { FixedInteractionDefinition } from "../formats/overworld";
import { fieldExtent } from "./worldTopology";

export interface FixedInteractionReturnPose {
  readonly position: { readonly x: number; readonly y: number; readonly z: number };
  readonly yaw: number;
}

/**
 * PAL 0x002191D0 reconstructs an outdoor return from corners 2 -> 3 of the
 * selected fixed-interaction record. It places the car at that edge midpoint,
 * seeds native Y to -20 before the field contact callback, and derives vehicle
 * yaw from atan2(edgeX, edgeZ) minus a quarter turn. Browser world X is
 * reflected, so the recovered native yaw is negated for the Three.js frame.
 */
export function fixedInteractionReturnPose(
  interaction: Pick<FixedInteractionDefinition, "corners">,
): FixedInteractionReturnPose {
  const corner2 = interaction.corners[2];
  const corner3 = interaction.corners[3];
  if (!corner2 || !corner3) throw new Error("The authored fixed interaction has an incomplete return edge.");
  if ([corner2, corner3].some(([x, z]) => x === -1 && z === -1)) {
    throw new Error("The authored fixed interaction has no usable return edge.");
  }

  const sourceX = Math.fround(Math.fround(corner2[0] + corner3[0]) * 0.5);
  const sourceZ = Math.fround(Math.fround(corner2[1] + corner3[1]) * 0.5);
  const edgeX = Math.fround(corner3[0] - corner2[0]);
  const edgeZ = Math.fround(corner3[1] - corner2[1]);
  if (!Number.isFinite(edgeX) || !Number.isFinite(edgeZ) || (edgeX === 0 && edgeZ === 0)) {
    throw new Error("The authored fixed interaction has a degenerate return edge.");
  }

  // PAL atan2's exact negative-Z-axis result is 0x40490FDA, one float ULP
  // below the 0x40490FDB yaw-scale divisor used by the vehicle setup routine.
  const nativeAngle = edgeX === 0 && edgeZ < 0 ? 3.141592502593994 : Math.fround(Math.atan2(edgeX, edgeZ));
  const yawScale = Math.fround(Math.PI);
  const scaled = Math.fround(
    Math.fround(Math.fround(nativeAngle * Math.fround(32768)) / yawScale) - Math.fround(16384),
  );
  const nativeYaw = Math.trunc(scaled) & 0xffff;
  const signedNativeYaw = nativeYaw << 16 >> 16;
  const browserYaw = -Math.fround(Math.fround(signedNativeYaw * yawScale) / Math.fround(32768));

  return {
    position: { x: Math.fround(fieldExtent - sourceX), y: -20, z: sourceZ },
    yaw: browserYaw,
  };
}
