import { readNativeRaceContactData, type NativeAuxiliaryContactState } from "./nativeRaceContact";
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
export type NativeDrivingSurfaceIndex = 0 | 1 | 2 | 3 | 4 | 5;

export interface NativeDrivingMotionInput {
  readonly throttle: number;
  readonly steering: number;
  readonly surfaceIndex: NativeDrivingSurfaceIndex | undefined;
  readonly contact: {
    readonly driveContact: boolean;
    readonly accelerationY: number;
    readonly allowsYaw: boolean;
    readonly specialState: NativeAuxiliaryContactState;
    /** Category 10 selector 1, PAL equipment flag 0x0040. */
    readonly propellerEnabled: boolean;
  };
}

export interface NativeDrivingMotionStep {
  readonly commands: number;
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
    this.vehicle = createNativeRaceVehicleState(nativeYawFromBrowserRadians(yaw, authority.yawScale));
  }

  get nativeVehicle(): NativeRaceVehicleState {
    return this.vehicle;
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
    this.vehicle = createNativeRaceVehicleState(nativeYawFromBrowserRadians(yaw, this.authority.yawScale));
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
    const commands = nativeDrivingCommands(input, this.vehicle);
    let forward = localVelocity[2];
    if (input.contact.propellerEnabled && input.contact.specialState !== 0) {
      if (commands & 4) forward = (forward - 89) | 0;
      else if (commands & 1) forward = (forward + 89) | 0;
    }
    const drag = nativeRaceDrag(
      forward,
      localVelocity[0],
      this.equipment.mass,
      input.contact.specialState,
      0,
      0,
    );
    // Deep auxiliary contact replaces the runtime surface with 0x100651, whose
    // low three bits select grip slot 1. Otherwise preserve the source-owned
    // explicit surface-index bridge, including unresolved-neutral handling.
    const effectiveSurfaceIndex = input.contact.specialState > 0 ? 1 : input.surfaceIndex;
    const surfaceResolved = effectiveSurfaceIndex !== undefined;
    const equipment = surfaceResolved
      ? this.equipment
      : neutralUnresolvedSurfaceEquipment(this.equipment);
    const drive = advanceNativeRaceVehicleVelocity(
      this.vehicle,
      equipment,
      {
        localForwardSpeed: drag.forward,
        localSideSpeed: drag.side,
        surfaceIndex: effectiveSurfaceIndex ?? 0,
        driveContact: input.contact.driveContact,
        contactAccelerationY: input.contact.accelerationY,
        contactAllowsYaw: input.contact.allowsYaw,
      },
      commands,
      4,
      matrix,
      true,
      "symmetric",
    );
    this.vehicle = drive.state;
    this.velocity = drive.worldVelocity;
    const tickScale = 16 / 25 / this.authority.positionDivisor;
    // Field geometry/collision are rendered with X reflected from PAL
    // (`renderX = 1600 - nativeX`). Keep the native vehicle state untouched and
    // reflect only the host-space projection of its motion.
    const deltaX = -nativeVelocityStep(this.velocity[0]) / this.authority.positionDivisor;
    const deltaZ = nativeVelocityStep(this.velocity[2]) / this.authority.positionDivisor;
    const speed = drive.localForwardSpeed * tickScale / nativeDrivingFixedStepSeconds;
    return {
      commands,
      deltaX,
      deltaZ,
      speed,
      yaw: browserYawRadians(this.vehicle.yaw, this.authority.yawScale),
      steeringFraction: this.vehicle.steeringAccumulator / 32,
      nativeVelocity: this.velocity,
      nativeVehicle: this.vehicle,
      surfaceResolved,
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
  // Preserve PAL physical command semantics: 0x8000 is left, 0x2000 is right.
  // Browser handedness is handled at the coordinate projection boundary, not
  // by feeding the native control routine the opposite steering direction.
  if (input.steering < 0) commands |= 0x8000;
  else if (input.steering > 0) commands |= 0x2000;
  return commands;
}

export function nativeDrivingSurfaceIndex(surfaceKind: DrivingSurfaceKind): NativeDrivingSurfaceIndex | undefined {
  if (surfaceKind === "paved-road" || surfaceKind === "dry") return 0;
  if (surfaceKind === "dirt") return 1;
  if (surfaceKind === "wet") return 2;
  if (surfaceKind === "grass") return 3;
  if (surfaceKind === "snow") return 4;
  if (surfaceKind === "ice") return 5;
  return undefined;
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

function browserYawRadians(nativeYaw: number, yawScale: number): number {
  return -nativeYawRadians(nativeYaw, yawScale);
}

function nativeYawFromBrowserRadians(radians: number, yawScale: number): number {
  if (!Number.isFinite(radians)) throw new RangeError("Native driving yaw must be finite.");
  const reflected = -radians;
  const wrapped = Math.atan2(Math.sin(reflected), Math.cos(reflected));
  return Math.round(wrapped * 32768 / yawScale) & 0xffff;
}

function validateAuthority(authority: NativeDrivingMotionAuthority): void {
  if (!Number.isFinite(authority.positionDivisor) || authority.positionDivisor <= 0
    || !Number.isFinite(authority.yawScale) || authority.yawScale === 0) {
    throw new RangeError("Native driving motion requires executable-backed position/yaw scales.");
  }
}
