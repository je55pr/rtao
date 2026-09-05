import { Elf32AddressSpace } from '../formats/elf32';
import type { RaceActivityDescriptor } from '../formats/raceCatalogue';
import { advanceNativeGear, advanceNativeSteering } from './nativeRaceControls';
import { advanceNativeRaceDriveForce } from './nativeRaceDriveForce';
import { advanceNativeRaceDrift, nativeRaceYawStep, nativeTractionSpeed } from './nativeRaceTraction';
import { transformNativeRaceIntegerVector, type NativeRaceMatrix } from './nativeRaceMath';

export interface NativeRaceEquipment {
  readonly surfaceGrips: readonly number[];
  readonly engineScalar: number;
  readonly fuelConsumption: number;
  readonly mass: number;
  readonly steeringScalar: number;
  readonly brakeCurve: Uint8Array;
  readonly gearWords: readonly number[];
}

/** Ordinary opponent selector pointer assigned at 0x0021953C, flags at 0x00219544. */
export function ordinaryRaceOpponentEquipment(activity: RaceActivityDescriptor): { selectors: Uint8Array; equipmentFlags: number } {
  if (!activity.ordinaryRace || activity.rawSettings.length < 16) throw new RangeError('Ordinary race settings required.');
  return { selectors: activity.rawSettings.slice(0, 14), equipmentFlags: activity.rawSettings[14]! | activity.rawSettings[15]! << 8 };
}

/** Scalar equipment setup 0x00218F70. Reads the supplied PAL tables directly. */
export function readNativeRaceEquipment(executable: Uint8Array, selectors: readonly number[] | Uint8Array, carFlags = 0): NativeRaceEquipment {
  const limits = [0, 13, 12, 5, 6, 4, 4];
  for (let category = 1; category <= 6; category++) {
    const value = selectors[category];
    if (!Number.isInteger(value) || value! < 0 || value! >= limits[category]!) throw new RangeError(`Invalid native category ${category} selector.`);
  }
  const elf = new Elf32AddressSpace(executable);
  const i16 = (address: number): number => { const b = elf.bytes(address, 2); return (b[0]! | b[1]! << 8) << 16 >> 16; };
  const teammate = (carFlags & 0x30) !== 0;
  const surfaceGrips = Array.from({ length: 6 }, (_, i) => {
    const grip = i16(0x30163c + selectors[1]! * 28 + i * 2);
    return teammate ? (grip + Math.trunc(grip / 16)) << 16 >> 16 : grip;
  });
  let mass = elf.u32(0x301dc4 + selectors[3]! * 16) | 0;
  if (teammate) mass -= Math.trunc(mass / 4);
  if (i16(0x30164a + selectors[1]! * 28) !== 0) mass += 5;
  return { surfaceGrips, mass,
    engineScalar: elf.u32(0x301a9c + selectors[2]! * 24) | 0,
    fuelConsumption: i16(0x301aa0 + selectors[2]! * 24),
    steeringScalar: i16(0x3020b4 + selectors[5]! * 16),
    brakeCurve: elf.bytes(0x30219c + selectors[6]! * 44, 32).slice(),
    gearWords: Array.from({ length: 8 }, (_, i) => i16(0x301ef4 + selectors[4]! * 28 + i * 2)),
  };
}

export interface NativeRaceVehicleState {
  gear: number;
  steeringAccumulator: number;
  steeringSpeedMemory: number;
  curvature: number;
  engineSpeed: number;
  nativeSpeed: number;
  wheelSpeed: number;
  brakeHold: number;
  fuel: number;
  yaw: number;
  slipAngle: number;
  driftRate: number;
  runtimeFlags: number;
}

/** Memset at 0x00219354; gear 1 at 0x00219C88; fuel at 0x00219588. Grid supplies yaw. */
export function createNativeRaceVehicleState(yaw: number): NativeRaceVehicleState {
  return { gear: 1, steeringAccumulator: 0, steeringSpeedMemory: 0, curvature: 0, engineSpeed: 0,
    nativeSpeed: 0, wheelSpeed: 0, brakeHold: 0, fuel: 0x40000, yaw: yaw & 65535,
    slipAngle: 0, driftRate: 0, runtimeFlags: 0 };
}

export interface NativeRaceContactInput {
  /** Local input vector after boost/drag. Distinct from the returned drive vector. */
  readonly localForwardSpeed: number;
  readonly localSideSpeed: number;
  readonly surfaceIndex: number;
  /** car +0x1E0/+0x1E4: either nonzero enables the force contact multiplier 89. */
  readonly driveContact: boolean;
  /** Local transformed support vector Y used for the +0x1B8 traction-speed write. */
  readonly contactAccelerationY: number;
  readonly contactAllowsYaw: boolean;
}

/**
 * Scalar composition of 0x0021B1C0, through its drift callback. The caller
 * supplies native contact and transforms the returned local velocity using the
 * pre-update matrix. Audio/skid visuals and VU transforms are outside this API.
 */
export function advanceNativeRaceVehicle(state: NativeRaceVehicleState, equipment: NativeRaceEquipment,
  contact: NativeRaceContactInput, commands: number, sceneFlags: number, highShiftSchedule = true): {
    state: NativeRaceVehicleState; localForwardSpeed: number; localSideSpeed: number; slipMagnitude: number;
  } {
  const gripWord = equipment.surfaceGrips[contact.surfaceIndex];
  if (gripWord === undefined) throw new RangeError('Unresolved native contact surface.');
  const gear = advanceNativeGear({ gear: state.gear, localForwardSpeed: contact.localForwardSpeed, commands, gearWords: equipment.gearWords, highShiftSchedule });
  const steering = advanceNativeSteering({ commands, accumulator: state.steeringAccumulator, speedMemory: state.steeringSpeedMemory,
    localForwardSpeed: contact.localForwardSpeed, steeringScalar: equipment.steeringScalar });
  const brakeHold = (commands & 2) !== 0 ? Math.min(32, state.brakeHold + 1) : 0;
  const brakeForce = brakeHold ? equipment.brakeCurve[brakeHold - 1]! * 10000 >> 5 : 0;
  const grip = Math.trunc(gripWord * (contact.driveContact ? 89 : 0) / 256);
  const force = advanceNativeRaceDriveForce({ ...contact, ...equipment, engineSpeed: state.engineSpeed, gearWord: equipment.gearWords[gear]!,
    grip, brakeForce, commands, driveEnabled: (sceneFlags & 4) !== 0, fuel: state.fuel, runtimeFlags: state.runtimeFlags });
  const nativeSpeed = nativeTractionSpeed(contact.localForwardSpeed, state.nativeSpeed,
    Math.trunc(gripWord * contact.contactAccelerationY / 256), equipment.mass, brakeForce);
  const yaw = nativeRaceYawStep({ ...state, nativeSpeed, curvature: steering.curvature, contactAllowsYaw: contact.contactAllowsYaw });
  const drift = advanceNativeRaceDrift({ ...state, ...yaw, nativeSpeed, wheelSpeed: force.wheelSpeed,
    curvature: steering.curvature, grip, brakeForce, runtimeFlags: force.runtimeFlags });
  return { state: { ...state, ...drift, gear, brakeHold, engineSpeed: force.engineSpeed, fuel: force.fuel,
    wheelSpeed: force.wheelSpeed, nativeSpeed, steeringAccumulator: steering.accumulator,
    steeringSpeedMemory: steering.speedMemory, curvature: steering.curvature },
    localForwardSpeed: force.localForwardSpeed, localSideSpeed: force.localSideSpeed, slipMagnitude: force.slipMagnitude };
}

/** 0x21B654: transform the zero-Y drive vector with the PRE-update car matrix.
 * This closes the command consumer's VU boundary, not the enclosing frame's
 * gravity, drag, contact, obstacle and collision-response sequence. */
export function advanceNativeRaceVehicleVelocity(state: NativeRaceVehicleState, equipment: NativeRaceEquipment,
  contact: NativeRaceContactInput, commands: number, sceneFlags: number, previousMatrix: NativeRaceMatrix,
  highShiftSchedule = true) {
  const result = advanceNativeRaceVehicle(state,equipment,contact,commands,sceneFlags,highShiftSchedule);
  return {...result,worldVelocity:transformNativeRaceIntegerVector(previousMatrix,[result.localSideSpeed,0,result.localForwardSpeed,0])};
}

/** Local quadratic drag from 0x0021CD88..0x0021CEA8 (debug text excluded). */
export function nativeRaceDrag(forward: number, side: number, mass: number, specialState: number, raceModeByte: number, positionIndex: number): { forward: number; side: number } {
  let divisor = (raceModeByte & 2) !== 0 && positionIndex !== 0 ? 1280 : 1536;
  if (specialState < 0) divisor >>= 1;
  else if (specialState > 0) divisor = Math.trunc(divisor / 4);
  const decay = (speed: number, denominator: number): number => {
    const q = Math.trunc(speed / denominator), amount = Math.trunc(Math.imul(q, q) / mass);
    return (speed + (q < 0 ? amount : -amount)) | 0;
  };
  return { forward: decay(forward, divisor), side: decay(side, specialState > 0 ? 64 : 1024) };
}

/** Position accumulator at 0x0021D1B8; X/Z have native 28-bit wrapping. */
export function integrateNativeRacePosition(position: readonly [number, number, number], velocity: readonly [number, number, number]): [number, number, number] {
  return position.map((value, axis) => {
    const next = (value + Math.trunc((velocity[axis]! << 4) / 25)) | 0;
    return axis === 1 ? next : next & 0x0fffffff;
  }) as [number, number, number];
}

/** Coordinate extraction at 0x0021D2F0; PAL gp-32476 divisor. */
export function nativeRacePositionCoordinates(position: readonly [number, number, number]): [number, number, number] {
  return [((position[0] + ((position[2] & 0x02000000) >>> 1)) & 0x01ffffff), position[1], position[2] & 0x01ffffff]
    .map(value => Math.fround(Math.fround(value) / 20971.51953125)) as [number, number, number];
}
