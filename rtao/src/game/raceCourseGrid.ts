import type { CompiledFieldCollision } from "../formats/fieldCollision";
import type { RaceStartSeed } from "../formats/raceCatalogue";
import { FieldCollisionSampler, type Vec3 } from "./worldCollision";

export interface GroundedRaceStart {
  readonly courseId: number;
  readonly startIndex: number;
  readonly position: Vec3;
  readonly yaw: number;
  readonly surfaceFlags: number;
}

/**
 * Applies the web port's established `renderX = 1600 - nativeX` reflection,
 * then resolves the executable-derived start seed against course collision.
 * PAL selects its course collision helper at 0x00208790 and calls it directly
 * after the four start-grid branches at 0x002198F0.
 */
export class RaceCourseGridSampler {
  private readonly collision: FieldCollisionSampler;

  constructor(collision: CompiledFieldCollision) {
    this.collision = new FieldCollisionSampler(collision);
  }

  ground(seed: RaceStartSeed): GroundedRaceStart {
    const renderX = 1600 - seed.nativeX;
    const sample = this.collision.sampleClosest(renderX, seed.nativeZ, seed.nativeY);
    if (!sample) {
      throw new Error(`PAL race course C${seed.courseId.toString().padStart(2, "0")} start slot ${seed.startIndex} has no collision ground.`);
    }
    return {
      courseId: seed.courseId,
      startIndex: seed.startIndex,
      position: { x: renderX, y: sample.y, z: seed.nativeZ },
      yaw: -(seed.nativeYaw / 0x10000) * Math.PI * 2,
      surfaceFlags: sample.surfaceFlags,
    };
  }
}
