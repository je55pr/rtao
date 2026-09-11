export interface HorizontalBounds {
  readonly minimum: readonly number[];
  readonly maximum: readonly number[];
}

export interface OrientedContactBody {
  readonly position: { readonly x: number; readonly z: number };
  readonly yaw: number;
  readonly bounds: HorizontalBounds;
}

export class ContactEdgeTracker {
  private active = new Set<string>();

  update(keys: readonly string[]): string[] {
    const next = new Set(keys);
    const entered: string[] = [];
    for (const key of next) {
      if (!this.active.has(key)) entered.push(key);
    }
    this.active = next;
    return entered;
  }

  clear(): void {
    this.active.clear();
  }
}

export function orientedBoundsOverlapXZ(a: OrientedContactBody, b: OrientedContactBody): boolean {
  const frameA = contactFrame(a);
  const frameB = contactFrame(b);
  const deltaX = frameB.centerX - frameA.centerX;
  const deltaZ = frameB.centerZ - frameA.centerZ;
  const axes = [frameA.right, frameA.forward, frameB.right, frameB.forward] as const;
  for (const axis of axes) {
    const distance = Math.abs(deltaX * axis[0] + deltaZ * axis[1]);
    const reach = projectionRadius(frameA, axis) + projectionRadius(frameB, axis);
    if (distance > reach + 1e-6) return false;
  }
  return true;
}

type Axis = readonly [number, number];
type ContactFrame = {
  readonly centerX: number;
  readonly centerZ: number;
  readonly halfX: number;
  readonly halfZ: number;
  readonly right: Axis;
  readonly forward: Axis;
};

function contactFrame(body: OrientedContactBody): ContactFrame {
  const minX = body.bounds.minimum[0] ?? 0;
  const minZ = body.bounds.minimum[2] ?? 0;
  const maxX = body.bounds.maximum[0] ?? 0;
  const maxZ = body.bounds.maximum[2] ?? 0;
  const localCenterX = (minX + maxX) * 0.5;
  const localCenterZ = (minZ + maxZ) * 0.5;
  const right = [Math.cos(body.yaw), -Math.sin(body.yaw)] as const;
  const forward = [Math.sin(body.yaw), Math.cos(body.yaw)] as const;
  return {
    centerX: body.position.x + right[0] * localCenterX + forward[0] * localCenterZ,
    centerZ: body.position.z + right[1] * localCenterX + forward[1] * localCenterZ,
    halfX: Math.abs(maxX - minX) * 0.5,
    halfZ: Math.abs(maxZ - minZ) * 0.5,
    right,
    forward,
  };
}

function projectionRadius(frame: ContactFrame, axis: Axis): number {
  const rightDot = Math.abs(frame.right[0] * axis[0] + frame.right[1] * axis[1]);
  const forwardDot = Math.abs(frame.forward[0] * axis[0] + frame.forward[1] * axis[1]);
  return frame.halfX * rightDot + frame.halfZ * forwardDot;
}
