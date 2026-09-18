import { readNativeRaceContactData } from "./nativeRaceContact";
import {
  inverseNativeRaceMatrix,
  nativeRaceYawMatrix,
  readNativeRaceMathData,
  transformNativeRaceIntegerVector,
  type NativeRaceMathData,
  type NativeRaceVector,
} from "./nativeRaceMath";
import {
  advanceNativeRaceVehicleVelocity,
  createNativeRaceVehicleState,
  nativeRaceDrag,
  readNativeRaceEquipment,
  type NativeRaceEquipment,
  type NativeRaceVehicleState,
} from "./nativeRaceVehicle";
import { nativeTyreGripProfiles } from "./nativeTyrePerformance";
import type { DrivingSurfaceKind } from "./worldCollision";

export const nativeDrivingFixedStepSeconds = 1 / 50;
const normalDryGrip = nativeTyreGripProfiles[0]!.dry;

export interface NativeDrivingMotionAuthority {
  readonly math: NativeRaceMathData;
  readonly positionDivisor: number;
  readonly yawScale: number;
  equipment(selectors: readonly number[]): NativeRaceEquipment;
}
export interface NativeDrivingMotionInput {
  readonly throttle: number;
  readonly steering: number;
  readonly surfaceKind: DrivingSurfaceKind;
  readonly contact: {
    readonly driveContact: boolean;
    readonly accelerationY: number;
    readonly allowsYaw: boolean;
  };
}

export interface NativeDrivingMotionStep {
  readonly deltaX: number;
  readonly deltaZ: number;
  readonly speed: number;
  readonly yaw: number;
  readonly steeringFraction: number;
  readonly nativeVelocity: NativeRaceVector;
  readonly nativeVehicle: NativeRaceVehicleState;
  readonly surfaceResolved: boolean;
}

export function readNativeDrivingMotionAuthority(executable: Uint8Array): NativeDrivingMotionAuthority {
  const contact = readNativeRaceContactData(executable);
  return {
    math: readNativeRaceMathData(executable),
    positionDivisor: contact.positionDivisor,
    yawScale: contact.yawScale,
    equipment: (selectors) => readNativeRaceEquipment(executable, selectors),
  };
}

export class NativeDrivingMotion {
  private readonly selectors = [0, 0, 0, 0, 0, 0, 0];
  private equipment: NativeRaceEquipment;
  private vehicle: NativeRaceVehicleState;
  private velocity: NativeRaceVector = [0, 0, 0, 0];

  constructor(
    private readonly authority: NativeDrivingMotionAuthority,
    yaw: number,
  ) {
    validateAuthority(authority);
    this.equipment = authority.equipment(this.selectors);
    this.vehicle = createNativeRaceVehicleState(nativeYawFromRadians(yaw, authority.yawScale));
  }

  setSelector(category: number, selector: number): void {
    if (!Number.isInteger(category) || category < 1 || category > 6) {
      throw new RangeError(`Native driving category must be 1..6; got ${category}.`);
    }
    const next = [...this.selectors];
    next[category] = selector;
    const equipment = this.authority.equipment(next);
    this.selectors[category] = selector;
    this.equipment = equipment;
  }

  reset(yaw: number): void {
    this.vehicle = createNativeRaceVehicleState(nativeYawFromRadians(yaw, this.authority.yawScale));
    this.velocity = [0, 0, 0, 0];
  }

  haltTranslation(): void {
    this.velocity = [0, 0, 0, 0];
    this.vehicle = {
      ...this.vehicle,
      nativeSpeed: 0,
      wheelSpeed: 0,
      slipAngle: 0,
      driftRate: 0,
    };
  }

  step(input: NativeDrivingMotionInput): NativeDrivingMotionStep {
    const oldYaw = nativeYawRadians(this.vehicle.yaw, this.authority.yawScale);
    const matrix = nativeRaceYawMatrix(oldYaw, this.authority.math);
    const inverse = inverseNativeRaceMatrix(matrix);
    const localVelocity = transformNativeRaceIntegerVector(inverse, this.velocity);
    const drag = nativeRaceDrag(localVelocity[2], localVelocity[0], this.equipment.mass, 0, 0, 0);
    const surface = nativeSurface(input.surfaceKind);
    const equipment = surface.resolved
      ? this.equipment
      : neutralUnresolvedSurfaceEquipment(this.equipment);
    const commands = nativeDrivingCommands(input, this.vehicle);
    const drive = advanceNativeRaceVehicleVelocity(
      this.vehicle,
      equipment,
      {
        localForwardSpeed: drag.forward,
        localSideSpeed: drag.side,
        surfaceIndex: surface.index,
        driveContact: input.contact.driveContact,
        contactAccelerationY: input.contact.accelerationY,
        contactAllowsYaw: input.contact.allowsYaw,
      },
      commands,
      4,
      matrix,
      true,
    );
    this.vehicle = drive.state;
    this.velocity = drive.worldVelocity;
    const tickScale = 16 / 25 / this.authority.positionDivisor;
    const deltaX = nativeVelocityStep(this.velocity[0]) / this.authority.positionDivisor;
    const deltaZ = nativeVelocityStep(this.velocity[2]) / this.authority.positionDivisor;
    const speed = drive.localForwardSpeed * tickScale / nativeDrivingFixedStepSeconds;
    return {
      deltaX,
      deltaZ,
      speed,
      yaw: nativeYawRadians(this.vehicle.yaw, this.authority.yawScale),
      steeringFraction: this.vehicle.steeringAccumulator / 32,
      nativeVelocity: this.velocity,
      nativeVehicle: this.vehicle,
      surfaceResolved: surface.resolved,
    };
  }
}

function nativeDrivingCommands(input: NativeDrivingMotionInput, vehicle: NativeRaceVehicleState): number {
  let commands = 0;
  if (input.throttle > 0) commands |= 1;
  else if (input.throttle < 0) {
    // The recovered consumer uses bit 4 to select reverse gear. The upstream
    // free-roam command producer is not recovered, so brake-to-stop then
    // reverse is kept as an explicit host bridge instead of inventing analog
    // pedal scaling inside native force arithmetic.
    commands |= vehicle.nativeSpeed > 0 ? 2 : 5;
  }
  if (input.steering < 0) commands |= 0x8000;
  else if (input.steering > 0) commands |= 0x2000;
  return commands;
}

function nativeSurface(surfaceKind: DrivingSurfaceKind): { index: number; resolved: boolean } {
  if (surfaceKind === "paved-road" || surfaceKind === "dry") return { index: 0, resolved: true };
  if (surfaceKind === "dirt") return { index: 1, resolved: true };
  if (surfaceKind === "wet") return { index: 2, resolved: true };
  if (surfaceKind === "grass") return { index: 3, resolved: true };
  if (surfaceKind === "snow") return { index: 4, resolved: true };
  if (surfaceKind === "ice") return { index: 5, resolved: true };
  return { index: 0, resolved: false };
}

function neutralUnresolvedSurfaceEquipment(equipment: NativeRaceEquipment): NativeRaceEquipment {
  const grips = [...equipment.surfaceGrips];
  grips[0] = normalDryGrip;
  return { ...equipment, surfaceGrips: grips };
}

function nativeVelocityStep(value: number): number {
  return Math.trunc(((value | 0) << 4) / 25) | 0;
}

function nativeYawRadians(yaw: number, yawScale: number): number {
  return Math.fround(Math.fround((yaw << 16 >> 16) * yawScale) / 32768);
}

function nativeYawFromRadians(radians: number, yawScale: number): number {
  if (!Number.isFinite(radians)) throw new RangeError("Native driving yaw must be finite.");
  const wrapped = Math.atan2(Math.sin(radians), Math.cos(radians));
  return Math.round(wrapped * 32768 / yawScale) & 0xffff;
}

function validateAuthority(authority: NativeDrivingMotionAuthority): void {
  if (!Number.isFinite(authority.positionDivisor) || authority.positionDivisor <= 0
    || !Number.isFinite(authority.yawScale) || authority.yawScale === 0) {
    throw new RangeError("Native driving motion requires executable-backed position/yaw scales.");
  }
}
