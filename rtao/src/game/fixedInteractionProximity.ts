import type { FixedInteractionDefinition } from "../formats/overworld";

export function findNearestFixedInteraction(
  interactions: readonly FixedInteractionDefinition[],
  fieldNumber: number,
  position: { readonly x: number; readonly z: number },
  maximumDistance = 3,
): { interaction: FixedInteractionDefinition; distance: number } | undefined {
  let nearest: { interaction: FixedInteractionDefinition; distance: number } | undefined;
  const sourcePoint = [1600 - position.x, position.z] as const;
  for (const interaction of interactions) {
    if (interaction.fieldNumber !== fieldNumber) continue;
    if (interaction.corners.some(([x, z]) => x === -1 && z === -1)) continue;
    const distance = distanceToPolygon(sourcePoint, interaction.corners);
    if (distance <= maximumDistance && (!nearest || distance < nearest.distance)) {
      nearest = { interaction, distance };
    }
  }
  return nearest;
}

export function distanceToPolygon(
  point: readonly [number, number],
  corners: ReadonlyArray<readonly [number, number]>,
): number {
  let sign = 0;
  let inside = true;
  let minimumDistanceSquared = Number.POSITIVE_INFINITY;
  for (let index = 0; index < corners.length; index += 1) {
    const a = corners[index];
    const b = corners[(index + 1) % corners.length];
    if (!a || !b) continue;
    const cross = (b[0] - a[0]) * (point[1] - a[1]) - (b[1] - a[1]) * (point[0] - a[0]);
    const edgeSign = Math.sign(cross);
    if (edgeSign !== 0) {
      if (sign === 0) sign = edgeSign;
      else if (edgeSign !== sign) inside = false;
    }
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const edgeLengthSquared = dx * dx + dz * dz;
    const projection = edgeLengthSquared < 1e-6
      ? 0
      : Math.max(0, Math.min(1, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dz) / edgeLengthSquared));
    const nearestX = a[0] + dx * projection;
    const nearestZ = a[1] + dz * projection;
    const offsetX = point[0] - nearestX;
    const offsetZ = point[1] - nearestZ;
    minimumDistanceSquared = Math.min(minimumDistanceSquared, offsetX * offsetX + offsetZ * offsetZ);
  }
  return inside ? 0 : Math.sqrt(minimumDistanceSquared);
}
