import type {
  NativeDrivingContactKinematics,
  NativeDrivingMotionAuthority,
  NativeDrivingMotionStep,
  NativeDrivingRetainedContact,
} from "./nativeDrivingMotion";
import type {
  NativeRaceContactDependencies,
  NativeRaceContactState,
} from "./nativeRaceContact";
import type { NativeRaceCollisionPoint } from "./nativeRaceCollision";
import { nativeRaceBodyMatrix } from "./nativeRaceBody";
import {
  advanceNativeRaceContact,
  inverseNativeRaceMatrix,
  nativeRaceYawMatrix,
  type NativeRaceMatrix,
  type NativeRaceVector,
} from "./nativeRaceMath";
import { nativeRacePositionDelta } from "./nativeRaceVehicle";
import {
  addressFromFieldNumber,
  fieldNumberFromAddress,
  fieldExtent,
  worldGridHeight,
  worldGridWidth,
} from "./worldTopology";
export type NativeOutdoorContactQuery = (
  fieldNumber: number,
  point: NativeRaceCollisionPoint,
  sector: number,
  probeIndex: number,
) => ReturnType<NativeRaceContactDependencies["query"]>;

export interface NativeOutdoorContactPose {
  readonly fieldNumber: number;
  readonly position: { readonly x: number; readonly y: number; readonly z: number };
  readonly pitch: number;
  readonly roll: number;
  readonly surfaceFlags: number;
  readonly hasGroundSupport: boolean;
  readonly auxiliaryY: number | undefined;
  /** PAL local chassis transform derived from retained support history. */
  readonly bodyMatrix: NativeRaceMatrix;
}

const f = Math.fround;
const nativeFieldSpan = 0x02000000;
const nativeRowStagger = nativeFieldSpan / 2;
const nativeWorldCircumference = nativeFieldSpan * worldGridWidth;

export class NativeOutdoorContact {
  private fieldNumber: number;
  private contact: NativeRaceContactState;
  private matrix: NativeRaceMatrix;
  private inverse: NativeRaceMatrix;
  private bodyMatrix: NativeRaceMatrix;
  private surfaces: readonly number[] = Array(7).fill(-1);
  private previousVelocity: NativeRaceVector = [0, 0, 0, 0];
  private normal: NativeRaceVector = [0, 1, 0, 0];
  private auxiliaryY: number | undefined;

  constructor(
    private readonly authority: NativeDrivingMotionAuthority,
    fieldNumber: number,
    renderPosition: { readonly x: number; readonly y: number; readonly z: number },
    nativeYaw: number,
  ) {
    this.fieldNumber = fieldNumber;
    const position: [number, number, number] = [
      fixedCoordinate(fieldExtent - renderPosition.x, authority.positionDivisor),
      fixedCoordinate(renderPosition.y, authority.positionDivisor),
      fixedCoordinate(renderPosition.z, authority.positionDivisor),
    ];
    this.contact = {
      position,
      referenceY: renderPosition.y,
      support: [4096, 4096, 4096],
      supportDelta: [0, 0, 0],
      impulses: [0, 0, 0],
      unsupportedTicks: 0,
      runtimeFlags: 0,
      specialState: 0,
      yaw: nativeYaw,
    };
    const yawRadians = nativeYawRadians(nativeYaw, authority.yawScale);
    this.matrix = nativeRaceYawMatrix(yawRadians, authority.math);
    this.inverse = inverseNativeRaceMatrix(this.matrix);
    this.bodyMatrix = nativeRaceBodyMatrix(this.contact.support, 0, authority.body);
  }

  get specialState(): -1 | 0 | 1 {
    return this.contact.specialState < 0 ? -1 : this.contact.specialState > 0 ? 1 : 0;
  }

  get runtimeFlags(): number {
    return this.contact.runtimeFlags >>> 0;
  }

  get retainedContact(): NativeDrivingRetainedContact {
    return {
      surfaceFlags: this.surfaces[0],
      support: this.contact.support,
      matrix: this.matrix,
      inverse: this.inverse,
      previousVelocity: this.previousVelocity,
    };
  }

  prime(
    query: NativeOutdoorContactQuery,
    equipmentFlags = 0,
    globalEquipmentFlags = 0,
  ): void {
    this.applyContact({
      position: this.contact.position,
      yaw: this.contact.yaw,
      commands: 0,
      kinematics: {
        previousVelocity: [0, 0, 0, 0],
        localDelta: [0, 0, 0, 0],
        gravity: [0, 89, 0, 0],
        dragForward: 0,
        mass: 1,
      },
      localX: 0,
      query,
      equipmentFlags,
      globalEquipmentFlags,
      impulses: this.contact.impulses,
      runtimeFlags: 0,
    });
  }

  advance(
    step: NativeDrivingMotionStep,
    query: NativeOutdoorContactQuery,
    equipmentFlags = 0,
    globalEquipmentFlags = 0,
  ): boolean {
    const kinematics = step.nativeContactKinematics;
    if (!kinematics) throw new Error("Native outdoor contact requires retained motion kinematics.");
    const candidate: [number, number, number] = [
      (this.contact.position[0] + nativeRacePositionDelta(step.nativeVelocity[0])) | 0,
      (this.contact.position[1] + nativeRacePositionDelta(step.nativeVelocity[1])) | 0,
      (this.contact.position[2] + nativeRacePositionDelta(step.nativeVelocity[2])) | 0,
    ];
    const normalized = normalizeNativeFixedPosition(this.fieldNumber, candidate[0], candidate[2]);
    if (!normalized) return false;
    candidate[0] = normalized.x;
    candidate[2] = normalized.z;
    this.fieldNumber = normalized.fieldNumber;
    const impulses = dampImpulses(this.contact.impulses, this.contact.specialState, kinematics.mass);
    this.applyContact({
      position: candidate,
      yaw: step.nativeVehicle.yaw,
      commands: step.commands,
      kinematics,
      localX: step.nativeVehicle.curvature === 0 ? 0 : kinematics.localDelta[0],
      query,
      equipmentFlags,
      globalEquipmentFlags,
      impulses,
      runtimeFlags: step.nativeVehicle.runtimeFlags,
    });
    this.previousVelocity = kinematics.previousVelocity;
    return true;
  }

  pose(browserYaw: number): NativeOutdoorContactPose {
    const x = f(f(this.contact.position[0]) / this.authority.positionDivisor);
    const y = f(f(this.contact.position[1]) / this.authority.positionDivisor);
    const z = f(f(this.contact.position[2]) / this.authority.positionDivisor);
    const renderNormal = [-this.normal[0], this.normal[1], this.normal[2]] as const;
    const sine = Math.sin(browserYaw), cosine = Math.cos(browserYaw);
    const localX = cosine * renderNormal[0] - sine * renderNormal[2];
    const localY = renderNormal[1];
    const localZ = sine * renderNormal[0] + cosine * renderNormal[2];
    const roll = Math.asin(Math.max(-1, Math.min(1, -localX)));
    const pitch = Math.atan2(-localZ, localY);
    const surface = this.surfaces[0] ?? -1;
    return {
      fieldNumber: this.fieldNumber,
      position: { x: fieldExtent - x, y, z },
      pitch,
      roll,
      surfaceFlags: surface >= 0 ? surface : 0,
      hasGroundSupport: this.contact.support.some((value) => value !== 0),
      auxiliaryY: this.auxiliaryY,
      bodyMatrix: [...this.bodyMatrix],
    };
  }

  private applyContact(input: {
    readonly position: readonly [number, number, number];
    readonly yaw: number;
    readonly commands: number;
    readonly kinematics: NativeDrivingContactKinematics;
    readonly localX: number;
    readonly query: NativeOutdoorContactQuery;
    readonly equipmentFlags: number;
    readonly globalEquipmentFlags: number;
    readonly impulses: readonly number[];
    readonly runtimeFlags: number;
  }): void {
    const result = advanceNativeRaceContact({
      state: {
        ...this.contact,
        position: [...input.position],
        referenceY: this.contact.referenceY,
        yaw: input.yaw,
        runtimeFlags: input.runtimeFlags,
        impulses: input.impulses,
      },
      equipmentFlags: input.equipmentFlags,
      globalEquipmentFlags: input.globalEquipmentFlags,
      // Free-roam car/scene effect flags are not recovered. Keep their
      // sound/impact/scene-command branches disabled rather than borrowing race defaults.
      carFlags: 0,
      sceneFlags: 0,
      sceneByte0B: 0,
      sceneCommands: [0, 0],
      localX: input.localX,
      localZ: input.kinematics.localDelta[2],
      responseZ: input.kinematics.dragForward,
      responseW: input.kinematics.gravity[1],
      // The free-roam producer for this value remains unrecovered. Zero is the
      // fail-closed neutral input rather than a browser slope approximation.
      verticalImpulse: 0,
      commands: input.commands,
    }, this.authority.contact, this.authority.math, this.matrix,
    (point, sector, probeIndex) => input.query(this.fieldNumber, point, sector, probeIndex));
    const referenceY = f(f(result.state.position[1]) / this.authority.positionDivisor);
    this.contact = { ...result.state, referenceY };
    this.matrix = result.matrix;
    this.inverse = result.inverse;
    this.bodyMatrix = nativeRaceBodyMatrix(result.state.support, input.equipmentFlags, this.authority.body);
    this.surfaces = result.surfaces;
    this.normal = result.normal;
    this.auxiliaryY = result.points[0]?.[3];
  }
}

function dampImpulses(
  impulses: readonly number[],
  specialState: number,
  mass: number,
): number[] {
  return impulses.map((value) => {
    const divisor = specialState > 0 ? 64 : 1024;
    const quotient = Math.trunc(value / divisor);
    const amount = Math.trunc(Math.imul(quotient, quotient) / mass);
    return (value + (quotient < 0 ? amount : -amount)) | 0;
  });
}

function fixedCoordinate(value: number, divisor: number): number {
  return Math.trunc(f(f(value) * f(divisor))) | 0;
}

function nativeYawRadians(yaw: number, yawScale: number): number {
  return f(f((yaw << 16 >> 16) * yawScale) / 32768);
}

function normalizeNativeFixedPosition(
  currentFieldNumber: number,
  x: number,
  z: number,
): { readonly fieldNumber: number; readonly x: number; readonly z: number } | undefined {
  const current = addressFromFieldNumber(currentFieldNumber);
  const currentBaseX = current.column * nativeFieldSpan + ((current.row & 1) ? nativeRowStagger : 0);
  const canonicalX = currentBaseX + x;
  const rowDelta = Math.floor(z / nativeFieldSpan);
  const targetRow = current.row + rowDelta;
  if (targetRow < 0 || targetRow >= worldGridHeight) return undefined;
  const localZ = positiveModulo(z, nativeFieldSpan);

  for (let column = 0; column < worldGridWidth; column += 1) {
    const candidateBaseX = column * nativeFieldSpan + ((targetRow & 1) ? nativeRowStagger : 0);
    const localX = positiveModulo(canonicalX - candidateBaseX, nativeWorldCircumference);
    if (localX < nativeFieldSpan) {
      return { fieldNumber: fieldNumberFromAddress(column, targetRow), x: localX | 0, z: localZ | 0 };
    }
  }
  return undefined;
}

function positiveModulo(value: number, modulus: number): number {
  const result = value % modulus;
  return result < 0 ? result + modulus : result;
}
